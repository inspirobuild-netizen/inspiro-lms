import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:media_kit/media_kit.dart';
import 'core/api/api_client.dart';
import 'core/router/app_router.dart';
import 'core/notifications/notification_service.dart';
import 'core/theme/brand.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  MediaKit.ensureInitialized();

  // Must run before anything touches ApiClient.dio (cookie jar + interceptors).
  await ApiClient.init();

  await Firebase.initializeApp();

  // FCM — init after Firebase, non-blocking (token registration happens async)
  unawaited(NotificationService.init());

  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  runApp(const ProviderScope(child: InspiroApp()));
}

// Suppress lint for intentional fire-and-forget
void unawaited(Future<void> future) {}

class InspiroApp extends ConsumerWidget {
  const InspiroApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
