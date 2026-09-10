import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'package:media_kit/media_kit.dart';
import 'core/api/api_client.dart';
import 'core/router/app_router.dart';
import 'core/notifications/notification_service.dart';
import 'core/refresh/app_refresh.dart';
import 'core/theme/brand.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  MediaKit.ensureInitialized();

  // Must run before anything touches ApiClient.dio (cookie jar + interceptors).
  await ApiClient.init();

  // Firebase is optional at startup. On iOS a missing GoogleService-Info.plist
  // makes initializeApp() throw, and because this runs before runApp() an
  // unguarded call takes the whole app down on launch — a build without the
  // config would look like a mystery crash rather than "push isn't set up".
  // Losing push is acceptable; failing to start is not.
  // Options come from the generated firebase_options.dart rather than the
  // per-platform native files. iOS then needs no GoogleService-Info.plist —
  // one committed source of truth for both platforms, and no CI secret to
  // keep in sync. (Firebase client config is public by design; it ships inside
  // every distributed binary. Access is governed by Security Rules, and the
  // FCM server key is not in this file.)
  var firebaseReady = false;
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    firebaseReady = true;
  } catch (e) {
    debugPrint('Firebase unavailable — continuing without push notifications: $e');
  }

  // FCM — init after Firebase, non-blocking (token registration happens async)
  if (firebaseReady) unawaited(NotificationService.init());

  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  runApp(const ProviderScope(child: InspiroApp()));
}

// Suppress lint for intentional fire-and-forget
void unawaited(Future<void> future) {}

/// Keeps the app's data current without a restart.
///
/// Two triggers, because staff actions reach a student two different ways:
/// a push while the app is open, and simply coming back to the app after it
/// was in the background. Either one refetches; the tab shell keeps screens
/// mounted, so without this nothing ever refetched at all.
class InspiroApp extends ConsumerStatefulWidget {
  const InspiroApp({super.key});

  @override
  ConsumerState<InspiroApp> createState() => _InspiroAppState();
}

class _InspiroAppState extends ConsumerState<InspiroApp> with WidgetsBindingObserver {
  StreamSubscription<RemoteMessage>? _pushSub;
  DateTime _lastRefresh = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pushSub = NotificationService.inboundStream.listen((message) {
      // The push says what changed, so refresh only what it touches — a doubt
      // reply should not make every tab refetch.
      AppRefresh.forNotificationType(ref, message.data['type'] as String?);
      _lastRefresh = DateTime.now();
    });
  }

  @override
  void dispose() {
    _pushSub?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // Coming back after a few seconds is usually a notification tap or a quick
    // app switch, and the push path has already refreshed. Anything longer and
    // the data is genuinely stale.
    if (DateTime.now().difference(_lastRefresh) < const Duration(seconds: 20)) return;
    _lastRefresh = DateTime.now();
    AppRefresh.everything(ref);
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Inspiro',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: Brand.blue,
        scaffoldBackgroundColor: Brand.bg,
        fontFamily: 'Inter',
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF181B2A),
          surfaceTintColor: Colors.transparent,
          elevation: 0,
        ),
      ),
    );
  }
}
