import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/coach/providers/coach_provider.dart';
import '../../features/courses/providers/courses_provider.dart';
import '../../features/current_affairs/providers/current_affairs_provider.dart';
import '../../features/doubts/providers/doubts_provider.dart';
import '../../features/enroll/providers/enroll_provider.dart';
import '../../features/exams/providers/exams_provider.dart';
import '../../features/home/providers/home_stats_provider.dart';
import '../../features/home/providers/my_batch_provider.dart';
import '../../features/home/widgets/banner_rail.dart';
import '../../features/leaderboard/providers/leaderboard_provider.dart';
import '../../features/live/providers/live_provider.dart';
import '../../features/notifications/providers/notifications_provider.dart';
import '../../features/spaces/providers/spaces_provider.dart';

/// Pulling fresh data without restarting the app.
///
/// Staff publish a class, an exam or an enrolment and the student saw none of
/// it until they force-quit and reopened. The tab shell keeps every screen
/// mounted, so an autoDispose provider that has already loaded never refetches
/// on its own — the app was, in effect, a snapshot of whenever it launched.
///
/// Invalidating is enough: a provider nobody is watching does nothing, and one
/// that is on screen refetches immediately. There is no need to know which tab
/// the student is looking at.
class AppRefresh {
  /// Everything a student can see. Used when the app returns to the
  /// foreground, and when a push arrives whose subject we cannot narrow down.
  static void everything(WidgetRef ref) {
    _invalidate(ref, [
      homeStatsProvider,
      myBatchProvider,
      myCourseBatchesProvider,
      coursesProvider,
      courseProgressProvider,
      catalogProvider,
      examsProvider,
      myAttemptsProvider,
      myDoubtsProvider,
      myActivitiesProvider,
      myFeedbackProvider,
      liveClassesProvider,
      notificationsProvider,
      unreadCountProvider,
      leaderboardProvider,
      myStreakProvider,
      coachPlanProvider,
      currentAffairsProvider,
      bannersProvider,
      myEnrollRequestsProvider,
      myPendingAccessProvider,
    ]);
  }

  /// Narrower refresh driven by the push's own type, so a doubt reply does not
  /// make the whole app refetch. Falls back to everything for unknown types.
  static void forNotificationType(WidgetRef ref, String? type) {
    switch (type) {
      case 'exam_alert':
      case 'result':
        _invalidate(ref, [examsProvider, myAttemptsProvider, homeStatsProvider, leaderboardProvider]);
        break;
      case 'doubt_reply':
        _invalidate(ref, [myDoubtsProvider, notificationsProvider, unreadCountProvider]);
        break;
      case 'class_reminder':
        _invalidate(ref, [liveClassesProvider, coursesProvider, courseProgressProvider]);
        break;
      case 'admission_update':
      case 'verification_update':
      case 'credentials_issued':
        // Access itself may have changed — the course list, the batch and the
        // pending-access banner all depend on it.
        _invalidate(ref, [
          myBatchProvider, myCourseBatchesProvider, coursesProvider, catalogProvider,
          myEnrollRequestsProvider, myPendingAccessProvider, homeStatsProvider,
        ]);
        break;
      case 'achievement':
        _invalidate(ref, [myStreakProvider, leaderboardProvider, homeStatsProvider]);
        break;
      default:
        everything(ref);
    }
    // The bell is always affected, whatever the subject.
    _invalidate(ref, [notificationsProvider, unreadCountProvider]);
  }

  static void _invalidate(WidgetRef ref, List<ProviderOrFamily> providers) {
    for (final p in providers) {
      ref.invalidate(p);
    }
  }
}
