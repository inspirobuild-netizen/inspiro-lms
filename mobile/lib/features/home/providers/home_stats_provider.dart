import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_fallback.dart';

class HomeStats {
  final int currentStreak;
  final int totalXp;
  final int? rank;
  const HomeStats({required this.currentStreak, required this.totalXp, required this.rank});
}

const _demoStats = HomeStats(currentStreak: 14, totalXp: 2400, rank: 47);

final homeStatsProvider = FutureProvider.autoDispose<HomeStats>((ref) async {
  return apiOrDemo(() async {
    final results = await Future.wait([
      ApiClient.dio.get<Map<String, dynamic>>('/api/v1/leaderboard/my-streak'),
      ApiClient.dio.get<Map<String, dynamic>>('/api/v1/leaderboard'),
    ]);

    final streakData = results[0].data!['data'] as Map<String, dynamic>;
    final lbMeta = results[1].data!['meta'] as Map<String, dynamic>?;

    return HomeStats(
      currentStreak: (streakData['currentStreak'] as num?)?.toInt() ?? 0,
      totalXp: (streakData['totalXp'] as num?)?.toInt() ?? 0,
      rank: (lbMeta?['myRank'] as num?)?.toInt(),
    );
  }, _demoStats);
});

/// Compact display form: 2400 -> "2.4k", 850 -> "850"
String formatXp(int xp) {
  if (xp >= 1000) return '${(xp / 1000).toStringAsFixed(1)}k';
  return '$xp';
}
