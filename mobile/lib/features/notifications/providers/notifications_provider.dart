import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/app_notification.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_fallback.dart';

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>(
    '/api/v1/notifications',
    queryParameters: {'limit': 50},
  );
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(AppNotification.fromJson)
      .toList();
});

/// Drives the bell badge. Falls back to 0 rather than erroring — a broken
/// count must never stop the home screen rendering.
final unreadCountProvider = FutureProvider.autoDispose<int>((ref) async {
  return apiOrDemo<int>(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/notifications/unread-count');
    return (res.data!['data'] as Map<String, dynamic>)['count'] as int? ?? 0;
  }, 0);
});

class NotificationsApi {
  NotificationsApi._();

  static Future<void> markRead(String id) async {
    await ApiClient.dio.patch<Map<String, dynamic>>('/api/v1/notifications/$id/read');
  }

  static Future<void> markAllRead() async {
    await ApiClient.dio.patch<Map<String, dynamic>>('/api/v1/notifications/read-all');
  }
}
