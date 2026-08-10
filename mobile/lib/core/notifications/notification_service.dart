import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:dio/dio.dart';
import '../api/api_client.dart';

// Background message handler — must be a top-level function
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialised by the time this runs
  // Just show local notification
  await NotificationService._showLocalNotification(message);
}

class NotificationService {
  NotificationService._();

  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'inspiro_high_importance',
    'Inspiro Notifications',
    description: 'Class reminders, exam alerts and announcements',
    importance: Importance.high,
  );

  static Future<void> init() async {
    // Request permission
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    // Initialise local notifications plugin
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
    );

    // Create high-importance Android channel
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    // Register background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Foreground message handler
    FirebaseMessaging.onMessage.listen((message) async {
      await _showLocalNotification(message);
    });

    // Register FCM token with our API
    await _registerToken();

    // Refresh token listener
    _messaging.onTokenRefresh.listen((token) async {
      await _sendTokenToApi(token);
    });
  }

  static Future<void> _registerToken() async {
    // getToken() sits inside the guard, not outside it: on a device without
    // working Play Services, or during an FCM outage, it throws
    // SERVICE_NOT_AVAILABLE and surfaced as an unhandled exception on every
    // launch. Push is a nice-to-have — it must never be loud on startup.
    try {
      final token = await _messaging.getToken();
      if (token != null) {
        await _sendTokenToApi(token);
      }
    } catch (_) {
      // Non-fatal — onTokenRefresh or the next launch will retry.
    }
  }

  static Future<void> _sendTokenToApi(String token) async {
    try {
      await ApiClient.dio.post<void>(
        '/api/v1/notifications/device-token',
        data: {
          'token': token,
          'platform': Platform.isAndroid ? 'android' : 'ios',
        },
      );
    } on DioException {
      // Non-fatal — will retry on next app launch
    }
  }

  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
    );
  }

  static Future<void> unregisterToken() async {
    // Same guard as _registerToken: this runs on sign-out, and a throwing
    // getToken() must not turn logging out into an error.
    String? token;
    try {
      token = await _messaging.getToken();
    } catch (_) {
      return;
    }
    if (token == null) return;
    try {
      await ApiClient.dio.delete<void>(
        '/api/v1/notifications/device-token',
        data: {'token': token},
      );
    } on DioException {
      // Ignore on logout
    }
    await _messaging.deleteToken();
  }
}
