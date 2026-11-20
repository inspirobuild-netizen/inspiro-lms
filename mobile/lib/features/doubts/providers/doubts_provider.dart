import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/doubt.dart';
import '../../../core/api/api_client.dart';

final myDoubtsProvider = FutureProvider.autoDispose<List<Doubt>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>(
    '/api/v1/doubts',
    queryParameters: {'limit': 50},
  );
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(Doubt.fromJson)
      .toList();
});

/// What the academy currently allows, so the app offers only real choices.
///
/// Asking for a mentor when the academy has AI switched off should not look
/// like a decision the student made — the option simply is not shown.
class DoubtOptions {
  final bool aiEnabled;
  final bool studentChoice;

  /// The academy's daily cap on AI answers for one student, and how many this
  /// student has left today. Null against an API that does not send them yet.
  final int? dailyLimit;
  final int? aiLeftToday;

  const DoubtOptions({
    required this.aiEnabled,
    required this.studentChoice,
    this.dailyLimit,
    this.aiLeftToday,
  });

  /// Mentor-only is the safe reading when the server cannot be reached: it is
  /// the route that always works.
  static const fallback = DoubtOptions(aiEnabled: false, studentChoice: false);
}

final doubtOptionsProvider = FutureProvider<DoubtOptions>((ref) async {
  try {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/settings/public');
    final d = res.data!['data'] as Map<String, dynamic>;
    return DoubtOptions(
      aiEnabled: d['aiDoubtsEnabled'] as bool? ?? false,
      studentChoice: d['aiDoubtsStudentChoice'] as bool? ?? false,
      dailyLimit: (d['aiDoubtsDailyLimit'] as num?)?.toInt(),
      aiLeftToday: (d['aiAnswersLeftToday'] as num?)?.toInt(),
    );
  } catch (_) {
    return DoubtOptions.fallback;
  }
});

/// Posts a doubt. The route says who the student asked for; the server has
/// the final say, since the academy may have AI switched off entirely.
final askDoubtProvider = Provider<
    Future<Doubt> Function({required String subject, required String body, required String route})>(
  (ref) {
    return ({required String subject, required String body, required String route}) async {
      final res = await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/doubts',
        data: {'subject': subject, 'body': body, 'requestedRoute': route},
      );
      ref.invalidate(myDoubtsProvider);
      // An AI answer uses one of today's; refresh what the picker shows.
      ref.invalidate(doubtOptionsProvider);
      return Doubt.fromJson(res.data!['data'] as Map<String, dynamic>);
    };
  },
);
