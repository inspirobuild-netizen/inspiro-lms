/// A student's enrolment request as the server reports it.
///
/// `channel` says how the money moves: 'gateway' is the in-app bank flow,
/// 'manual' is the older office-verified path (kept only so existing rows
/// still render). `batchName` is filled once they have been placed.
class EnrollRequest {
  final String id;
  final String courseId;
  final double amount;
  final String? reference;
  final String status; // pending | verified | rejected | failed
  final String channel; // gateway | manual
  final String? gatewayOrderId;
  final String? batchName;
  final String? rejectionReason;

  const EnrollRequest({
    required this.id,
    required this.courseId,
    required this.amount,
    required this.status,
    required this.channel,
    this.reference,
    this.gatewayOrderId,
    this.batchName,
    this.rejectionReason,
  });

  bool get isPayingOnline => channel == 'gateway' && status == 'pending';
  bool get isOfficePending => channel != 'gateway' && status == 'pending';

  factory EnrollRequest.fromJson(Map<String, dynamic> json) => EnrollRequest(
        id: json['id'] as String,
        courseId: json['courseId'] as String,
        amount: (json['amount'] as num).toDouble(),
        reference: json['reference'] as String?,
        status: json['status'] as String,
        channel: (json['channel'] as String?) ?? 'manual',
        gatewayOrderId: json['gatewayOrderId'] as String?,
        batchName: json['batchName'] as String?,
        rejectionReason: json['rejectionReason'] as String?,
      );
}

/// What the enrol screen needs before asking for money: the batch the student
/// will join, the price options, and whether online payment is possible at
/// all right now.
class EnrolOptions {
  final String courseId;
  final String courseTitle;
  final double feeAmount;
  final bool alreadyEnrolled;
  final EnrolBatch? batch; // null = no batch accepting online enrolment
  final bool canPayOnline; // false = no gateway; show the office route
  final String? unavailableReason;
  final List<EnrolPlan> plans;

  const EnrolOptions({
    required this.courseId,
    required this.courseTitle,
    required this.feeAmount,
    required this.alreadyEnrolled,
    required this.canPayOnline,
    required this.plans,
    this.batch,
    this.unavailableReason,
  });

  factory EnrolOptions.fromJson(Map<String, dynamic> j) => EnrolOptions(
        courseId: j['courseId'] as String,
        courseTitle: j['courseTitle'] as String,
        feeAmount: (j['feeAmount'] as num).toDouble(),
        alreadyEnrolled: j['alreadyEnrolled'] as bool? ?? false,
        canPayOnline: j['canPayOnline'] as bool? ?? false,
        unavailableReason: j['unavailableReason'] as String?,
        batch: j['batch'] == null ? null : EnrolBatch.fromJson(j['batch'] as Map<String, dynamic>),
        plans: ((j['plans'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(EnrolPlan.fromJson)
            .toList(),
      );
}

class EnrolBatch {
  final String id;
  final String name;
  final String? startDate;
  const EnrolBatch({required this.id, required this.name, this.startDate});
  factory EnrolBatch.fromJson(Map<String, dynamic> j) => EnrolBatch(
        id: j['id'] as String,
        name: j['name'] as String,
        startDate: j['startDate'] as String?,
      );
}

class EnrolPlan {
  final String id;
  final String name;
  final double totalAmount;
  final List<EnrolInstallment> installments;
  const EnrolPlan({required this.id, required this.name, required this.totalAmount, required this.installments});
  factory EnrolPlan.fromJson(Map<String, dynamic> j) => EnrolPlan(
        id: j['id'] as String,
        name: j['name'] as String,
        totalAmount: (j['totalAmount'] as num).toDouble(),
        installments: ((j['installments'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map((i) => EnrolInstallment(
                  label: i['label'] as String,
                  amount: (i['amount'] as num).toDouble(),
                ))
            .toList(),
      );
}

class EnrolInstallment {
  final String label;
  final double amount;
  const EnrolInstallment({required this.label, required this.amount});
}

/// Result of starting a checkout: where to send the student, and what to
/// poll afterwards.
class CheckoutSession {
  final String orderId;
  final double amount;
  final String paymentUrl;
  final String provider; // sandbox | hdfc
  final String courseId;
  final String courseTitle;
  final String batchName;

  const CheckoutSession({
    required this.orderId,
    required this.amount,
    required this.paymentUrl,
    required this.provider,
    required this.courseId,
    required this.courseTitle,
    required this.batchName,
  });

  factory CheckoutSession.fromJson(Map<String, dynamic> j) => CheckoutSession(
        orderId: j['orderId'] as String,
        amount: (j['amount'] as num).toDouble(),
        paymentUrl: j['paymentUrl'] as String,
        provider: j['provider'] as String,
        courseId: (j['course'] as Map<String, dynamic>)['id'] as String,
        courseTitle: (j['course'] as Map<String, dynamic>)['title'] as String,
        batchName: (j['batch'] as Map<String, dynamic>)['name'] as String,
      );
}

/// What the server knows about an order right now. The app never decides an
/// outcome itself — the bank's browser page can say anything; only the
/// server's settled state counts.
class CheckoutStatus {
  final String status; // pending | paid | failed
  final String? failureReason;
  final String? batchName;
  final String? gatewayPaymentId;
  const CheckoutStatus({required this.status, this.failureReason, this.batchName, this.gatewayPaymentId});
  factory CheckoutStatus.fromJson(Map<String, dynamic> j) => CheckoutStatus(
        status: j['status'] as String,
        failureReason: j['failureReason'] as String?,
        batchName: j['batchName'] as String?,
        gatewayPaymentId: j['gatewayPaymentId'] as String?,
      );
}
