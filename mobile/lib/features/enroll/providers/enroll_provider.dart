import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/enroll_request.dart';
import '../../../core/api/api_client.dart';

/// The student's own enrolment requests — drives the "pending verification"
/// banner so they know staff is reviewing their payment.
final myEnrollRequestsProvider = FutureProvider.autoDispose<List<EnrollRequest>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/me/enroll');
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(EnrollRequest.fromJson)
      .toList();
});

class EnrollApi {
  EnrollApi._();

  /// Creates (or refreshes) a pending request for this course and returns its
  /// QR. The amount comes from the chosen preset plan installment — never a
  /// number the app makes up.
  static Future<EnrollSession> start({
    required String courseId,
    String? feePlanId,
    int installmentIndex = 0,
  }) async {
    final res = await ApiClient.dio.post<Map<String, dynamic>>(
      '/api/v1/me/enroll',
      data: {
        'courseId': courseId,
        if (feePlanId != null) 'feePlanId': feePlanId,
        'installmentIndex': installmentIndex,
      },
    );
    return EnrollSession.fromJson(res.data!['data'] as Map<String, dynamic>);
  }

  /// Submits the UPI reference the student copied from their payment app.
  /// This does NOT activate access — staff verifies it against the bank first.
  static Future<void> submitReference({required String requestId, required String reference}) async {
    await ApiClient.dio.post<Map<String, dynamic>>(
      '/api/v1/me/enroll/$requestId/confirm',
      data: {'reference': reference},
    );
  }
}
