/// The server-built UPI collect request for an enrolment. The amount and
/// reference are decided server-side — the app only renders them.
class EnrollQr {
  final String upiUri;
  final double amount;
  final String reference;
  final String payeeName;
  final String vpa;

  const EnrollQr({
    required this.upiUri,
    required this.amount,
    required this.reference,
    required this.payeeName,
    required this.vpa,
  });

  factory EnrollQr.fromJson(Map<String, dynamic> json) => EnrollQr(
        upiUri: json['upiUri'] as String,
        amount: (json['amount'] as num).toDouble(),
        reference: json['reference'] as String,
        payeeName: json['payeeName'] as String,
        vpa: json['vpa'] as String,
      );
}

class EnrollRequest {
  final String id;
  final String courseId;
  final double amount;
  final String? reference;
  final String status; // pending | verified | rejected

  const EnrollRequest({
    required this.id,
    required this.courseId,
    required this.amount,
    required this.status,
    this.reference,
  });

  factory EnrollRequest.fromJson(Map<String, dynamic> json) => EnrollRequest(
        id: json['id'] as String,
        courseId: json['courseId'] as String,
        amount: (json['amount'] as num).toDouble(),
        reference: json['reference'] as String?,
        status: json['status'] as String,
      );
}

/// Result of POST /me/enroll — the pending request plus its QR.
class EnrollSession {
  final EnrollRequest request;
  final EnrollQr qr;

  const EnrollSession({required this.request, required this.qr});

  factory EnrollSession.fromJson(Map<String, dynamic> json) => EnrollSession(
        request: EnrollRequest.fromJson(json['request'] as Map<String, dynamic>),
        qr: EnrollQr.fromJson(json['qr'] as Map<String, dynamic>),
      );
}
