import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/profile_setup_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/learn/screens/learn_screen.dart';
import '../../features/learn/screens/course_detail_screen.dart';
import '../../features/learn/screens/video_player_screen.dart';
import '../../features/exams/screens/exams_screen.dart';
import '../../features/exams/screens/exam_player_screen.dart';
import '../../features/exams/models/exam.dart';
import '../../features/live/screens/live_classes_screen.dart';
import '../../features/live/screens/live_viewer_screen.dart';
import '../../features/live/models/live_class.dart';
import '../../features/profile/screens/me_screen.dart';
import '../../features/leaderboard/screens/leaderboard_screen.dart';
import '../../features/doubts/screens/doubt_chat_screen.dart';
import '../../features/current_affairs/screens/current_affairs_screen.dart';
import '../../features/coach/screens/coach_screen.dart';
import '../../features/enroll/screens/catalog_screen.dart';
import '../../features/enroll/screens/enroll_screen.dart';
import '../../features/courses/models/course.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/shell/main_shell.dart';
import '../auth/auth_provider.dart';

final _rootKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/splash',
    redirect: (context, state) {
      final loc = state.matchedLocation;
      if (loc == '/splash') return null; // splash routes itself
      if (!auth.initialised) return null;
      final loggedIn = auth.isAuthenticated;
      final onAuth = loc.startsWith('/login');
      final onProfileSetup = loc.startsWith('/profile-setup');

      if (!loggedIn) return onAuth ? null : '/login';

      // Brand-new self-signups get a bare 'New User' placeholder name from
      // the backend on first OTP verify — force the one-time profile step
      // before anything else. Counsellor-admitted students already have a
      // real name set at admission time, so this never triggers for them.
      final needsProfile = auth.user!.name.trim().isEmpty || auth.user!.name == 'New User';
      if (needsProfile) return onProfileSetup ? null : '/profile-setup';
      if (onAuth || onProfileSetup) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/profile-setup', builder: (_, __) => const ProfileSetupScreen()),

      // ── Main app shell: 5 bottom-nav tabs ────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => MainShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, __) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/learn', builder: (_, __) => const LearnScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/exams', builder: (_, __) => const ExamsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/live', builder: (_, __) => const LiveClassesScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/me', builder: (_, __) => const MeScreen())]),
        ],
      ),

      // ── Full-screen detail routes (push over the shell) ──────────────────────
      GoRoute(path: '/doubts', builder: (_, __) => const DoubtChatScreen()),
      GoRoute(path: '/current-affairs', builder: (_, __) => const CurrentAffairsScreen()),
      GoRoute(path: '/coach', builder: (_, __) => const CoachScreen()),
      GoRoute(path: '/leaderboard', builder: (_, __) => const LeaderboardScreen()),
      GoRoute(path: '/catalog', builder: (_, __) => const CatalogScreen()),
      GoRoute(
        path: '/enroll',
        builder: (context, state) => EnrollScreen(course: state.extra as Course),
      ),
      GoRoute(
        path: '/course',
        builder: (context, state) => CourseDetailScreen(
          courseId: state.extra is String ? state.extra as String : 'demo-1',
        ),
      ),
      GoRoute(
        path: '/lesson-player',
        builder: (context, state) {
          final extra = state.extra as Map<String, String>;
          return VideoPlayerScreen(lessonId: extra['lessonId']!, title: extra['title']!);
        },
      ),
      GoRoute(
        path: '/exam-player',
        builder: (context, state) {
          final extra = state.extra;
          if (extra is Exam) {
            return ExamPlayerScreen(
              examId: extra.id.startsWith('demo-') ? null : extra.id,
              title: extra.title,
              durationMins: extra.durationMins,
            );
          }
          return const ExamPlayerScreen();
        },
      ),
      GoRoute(
        path: '/live-class/:id',
        builder: (context, state) => LiveViewerScreen(joinResult: state.extra as JoinLiveClassResult),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      backgroundColor: const Color(0xFF0D0F1A),
      body: Center(
        child: Text('Page not found: ${state.matchedLocation}',
            style: const TextStyle(color: Colors.white54)),
      ),
    ),
  );
});
