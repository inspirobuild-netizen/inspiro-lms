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
