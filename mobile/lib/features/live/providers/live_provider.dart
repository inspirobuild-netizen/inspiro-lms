import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../models/live_class.dart';
import '../../../core/api/api_client.dart';

// ── Live class list ────────────────────────────────────────────────────────────
final liveClassesProvider = FutureProvider.autoDispose<List<LiveClass>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/live-classes');
  final data = (res.data!['data'] as List).cast<Map<String, dynamic>>();
  return data.map(LiveClass.fromJson).toList();
});

// ── Join state ────────────────────────────────────────────────────────────────
class LiveJoinState {
  final bool loading;
  final JoinLiveClassResult? result;
  final String? error;

  const LiveJoinState({this.loading = false, this.result, this.error});

  LiveJoinState copyWith({bool? loading, JoinLiveClassResult? result, String? error}) =>
      LiveJoinState(
        loading: loading ?? this.loading,
        result: result ?? this.result,
        error: error ?? this.error,
      );
}

class LiveJoinNotifier extends AutoDisposeNotifier<LiveJoinState> {
  @override
  LiveJoinState build() => const LiveJoinState();

  Future<void> join(String classId) async {
    state = const LiveJoinState(loading: true);
    try {
      final res = await ApiClient.dio
          .post<Map<String, dynamic>>('/api/v1/live-classes/$classId/join');
      final result = JoinLiveClassResult.fromJson(
          (res.data!['data'] as Map<String, dynamic>));
      state = LiveJoinState(result: result);
    } on DioException catch (e) {
      state = LiveJoinState(error: e.message ?? 'Failed to join class');
    }
  }

  void reset() => state = const LiveJoinState();
}

final liveJoinProvider =
    NotifierProvider.autoDispose<LiveJoinNotifier, LiveJoinState>(LiveJoinNotifier.new);
