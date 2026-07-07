import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/coach_plan.dart';
import '../../../core/api/api_client.dart';

final coachPlanProvider = FutureProvider.autoDispose<CoachPlan>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>(
    '/api/v1/coach/my-plan',
  );
  return CoachPlan.fromJson(res.data!['data'] as Map<String, dynamic>);
});
