import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/leaderboard_entry.dart';
import '../../../core/api/api_client.dart';

final leaderboardPeriodProvider = StateProvider.autoDispose<String>((ref) => 'weekly');

final leaderboardProvider = FutureProvider.autoDispose<LeaderboardResult>((ref) async {
  final period = ref.watch(leaderboardPeriodProvider);

  final res = await ApiClient.dio.get<Map<String, dynamic>>(
    '/api/v1/leaderboard',
    queryParameters: {'period': period, 'limit': 100},
  );

  final data = res.data!;
  final items = (data['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(LeaderboardEntry.fromJson)
      .toList();
  final meta = LeaderboardMeta.fromJson(data['meta'] as Map<String, dynamic>);

  return LeaderboardResult(entries: items, meta: meta);
});

final myStreakProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/leaderboard/my-streak');
  return (res.data!['data'] as Map<String, dynamic>);
});
