import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/current_affair.dart';
import '../../../core/api/api_client.dart';

final currentAffairsProvider =
    FutureProvider.autoDispose<List<CurrentAffair>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>(
    '/api/v1/current-affairs',
    queryParameters: {'limit': 30},
  );
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(CurrentAffair.fromJson)
      .toList();
});
