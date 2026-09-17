import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/enroll_request.dart';
import '../../../core/api/api_client.dart';

/// The student's own enrolment requests — drives the catalogue's "payment in
/// progress" and "awaiting office" states so they are never asked to pay
/// twice for the same course.
final myEnrollRequestsProvider = FutureProvider.autoDispose<List<EnrollRequest>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/me/enroll');
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(EnrollRequest.fromJson)
      .toList();
});

/// Everything the enrol screen shows before money changes hands.
final enrolOptionsProvider =
    FutureProvider.autoDispose.family<EnrolOptions, String>((ref, courseId) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/me/enroll/options/$courseId');
  return EnrolOptions.fromJson(res.data!['data'] as Map<String, dynamic>);
});

class EnrollApi {
  EnrollApi._();

  /// Creates the order at the bank and returns the page to send the student
  /// to. The amount is decided server-side from the plan or the course fee —
  /// never a number the app makes up.
  static Future<CheckoutSession> checkout({
    required String courseId,
    String? feePlanId,
    int installmentIndex = 0,
  }) async {
    final res = await ApiClient.dio.post<Map<String, dynamic>>(
      '/api/v1/me/enroll/checkout',
      data: {
        'courseId': courseId,
        if (feePlanId != null) 'feePlanId': feePlanId,
        'installmentIndex': installmentIndex,
      },
    );
    return CheckoutSession.fromJson(res.data!['data'] as Map<String, dynamic>);
  }

  /// The server's view of an order. Also nudges the bank when a webhook is
  /// late, so a student who paid is not left staring at a spinner.
  static Future<CheckoutStatus> status(String orderId) async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/me/enroll/checkout/$orderId');
    return CheckoutStatus.fromJson(res.data!['data'] as Map<String, dynamic>);
  }
}

/// Course ids where a counsellor has admitted the student but the admin has
/// not yet confirmed the payment. Shown as awaiting confirmation; without it
/// the student would be offered the pay button a second time.
final myPendingAccessProvider = FutureProvider.autoDispose<Set<String>>((ref) async {
  final res = await ApiClient.dio
      .get<Map<String, dynamic>>('/api/v1/enrollments/my-pending');
  final data = res.data!['data'] as Map<String, dynamic>;
  return ((data['courseIds'] as List?) ?? const []).cast<String>().toSet();
});
