import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../core/api/api_client.dart';

/// Deletes the signed-in student's account.
///
/// Order matters: our server first, because that is the record that grants
/// anything. Only once it has confirmed do we remove the Firebase sign-in
/// user, and that step is best-effort — Firebase may demand a recent login
/// to delete, and a stale Firebase user that our server no longer recognises
/// grants nothing. Returns null on success, or a message for the student.
Future<String?> deleteOwnAccount() async {
  try {
    await ApiClient.dio.delete<Map<String, dynamic>>('/api/v1/me');
  } on DioException catch (e) {
    final err = e.response?.data is Map ? (e.response!.data as Map)['error'] : null;
    final msg = err is Map ? err['message'] as String? : null;
    if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    return msg ?? 'Could not delete the account right now. Please try again.';
  }

  try {
    await FirebaseAuth.instance.currentUser?.delete();
  } catch (_) {
    // Requires-recent-login or offline: the sign-in record alone opens
    // nothing, and signing out below drops it from this device.
  }
  try {
    await FirebaseAuth.instance.signOut();
  } catch (_) {}
  return null;
}
