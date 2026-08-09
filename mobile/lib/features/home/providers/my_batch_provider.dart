import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_fallback.dart';

/// The student's current (active, or first) batch name — powers the profile
/// header badge. Null when the student isn't enrolled in any batch.
final myBatchProvider = FutureProvider.autoDispose<String?>((ref) async {
  return apiOrDemo<String?>(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/batches/my');
    final rows = (res.data!['data'] as List).cast<Map<String, dynamic>>();
    if (rows.isEmpty) return null;
    // Prefer an active enrollment; fall back to the first batch.
    final active = rows.firstWhere(
      (r) => (r['batch'] as Map)['status'] == 'active',
      orElse: () => rows.first,
    );
    return (active['batch'] as Map)['name'] as String?;
  }, 'UPSC 2026 · Batch A');
});

/// Course is the master: each batch belongs to exactly one course, so this
/// maps courseId → the student's batch name in that course. Used to label
/// course cards/detail with "which batch am I in".
final myCourseBatchesProvider = FutureProvider.autoDispose<Map<String, String>>((ref) async {
  return apiOrDemo<Map<String, String>>(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/batches/my');
    final rows = (res.data!['data'] as List).cast<Map<String, dynamic>>();
    final map = <String, String>{};
    for (final r in rows) {
      final batch = r['batch'] as Map<String, dynamic>;
      final courseId = batch['courseId'] as String?;
      final name = batch['name'] as String?;
      // First (typically active) enrollment wins per course.
      if (courseId != null && name != null && !map.containsKey(courseId)) {
        map[courseId] = name;
      }
    }
    return map;
  }, const {'demo-1': 'UPSC 2026 · Batch A'});
});
