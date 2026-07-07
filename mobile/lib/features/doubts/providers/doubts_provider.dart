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

/// Posts a doubt and returns it with the AI answer (or escalated status).
final askDoubtProvider =
    Provider<Future<Doubt> Function({required String subject, required String body})>(
  (ref) {
    return ({required String subject, required String body}) async {
      final res = await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/doubts',
        data: {'subject': subject, 'body': body},
      );
      ref.invalidate(myDoubtsProvider);
      return Doubt.fromJson(res.data!['data'] as Map<String, dynamic>);
    };
  },
);
