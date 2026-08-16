import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

/// Phone verification via Firebase Authentication.
///
/// Firebase sends and checks the SMS itself, so the app never handles an OTP
/// secret and the academy does not need TRAI/DLT-approved SMS templates. Once
/// Firebase confirms the number we hand its ID token to our own API, which
/// verifies the signature and issues the access/refresh pair the rest of the
/// app already uses — phone stays the identity key everywhere downstream.
class PhoneAuthService {
  PhoneAuthService._();

  /// Firebase is initialised in main() inside a try/catch, so a build with a
  /// broken or missing config still starts. Phone sign-in genuinely cannot
  /// work in that state, and asking for `FirebaseAuth.instance` would throw a
  /// raw platform error, so callers check this first and fall back to email.
  static bool get isAvailable => Firebase.apps.isNotEmpty;

  static FirebaseAuth get _auth => FirebaseAuth.instance;

  /// Sends the verification SMS.
  ///
  /// [onCodeSent] fires once the SMS is on its way; the returned resend token
  /// must be passed back on a resend so Firebase treats it as a retry of the
  /// same request rather than a fresh one.
  ///
  /// [onAutoVerified] only fires on Android, where the SMS can be read
  /// automatically — the user never types anything and we go straight to
  /// exchanging the credential.
  static Future<void> sendCode({
    required String phoneE164,
    required void Function(String verificationId, int? resendToken) onCodeSent,
    required void Function(PhoneAuthCredential credential) onAutoVerified,
    required void Function(String message, String? code) onFailed,
    int? resendToken,
  }) async {
    await _auth.verifyPhoneNumber(
      phoneNumber: phoneE164,
      forceResendingToken: resendToken,
      timeout: const Duration(seconds: 60),
      verificationCompleted: onAutoVerified,
      verificationFailed: (e) => onFailed(_message(e), e.code),
      codeSent: onCodeSent,
      // Auto-retrieval gave up; the user types the code by hand from here.
      // Nothing to do — the manual path is already on screen.
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  /// Signs in with the code the user typed and returns a Firebase ID token.
  static Future<String> exchangeSmsCode({
    required String verificationId,
    required String smsCode,
  }) {
    return exchangeCredential(
      PhoneAuthProvider.credential(
        verificationId: verificationId,
        smsCode: smsCode,
      ),
    );
  }

  /// Signs in with a credential and returns a Firebase ID token for our API.
  static Future<String> exchangeCredential(PhoneAuthCredential credential) async {
    final result = await _auth.signInWithCredential(credential);
    final token = await result.user?.getIdToken();
    if (token == null || token.isEmpty) {
      throw const PhoneAuthFailure('Could not verify your number. Please try again.');
    }

    // The Firebase session has done its one job. Our own tokens carry the
    // session from here, so leaving a second signed-in identity around would
    // only be a source of confusion later.
    unawaited(_auth.signOut());

    return token;
  }

  /// Maps Firebase's error codes to something a student can act on.
  static String _message(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-phone-number':
        return 'That does not look like a valid mobile number.';
      case 'too-many-requests':
        return 'Too many attempts from this device. Please try again later.';
      case 'quota-exceeded':
        return 'Sign-in is temporarily unavailable. Please try again later.';
      case 'invalid-verification-code':
        return 'That code is not correct. Please check and try again.';
      case 'session-expired':
        return 'The code has expired. Request a new one.';
      case 'network-request-failed':
        return 'Cannot reach the network. Check your connection and try again.';
      default:
        return e.message ?? 'Verification failed. Please try again.';
    }
  }

  /// Turns a raw Firebase exception into the same friendly text as above, for
  /// the code paths that throw rather than call back.
  static String describe(Object error) {
    if (error is FirebaseAuthException) return _message(error);
    if (error is PhoneAuthFailure) return error.message;
    return 'Verification failed. Please try again.';
  }
}

class PhoneAuthFailure implements Exception {
  final String message;
  const PhoneAuthFailure(this.message);

  @override
  String toString() => message;
}
