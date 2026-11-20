class Doubt {
  final String id;
  final String subject;
  final String body;
  final String? imageUrl;
  final String? aiAnswer;
  final double? aiConfidence;
  final String? humanAnswer;
  final String status; // open | ai_answered | escalated | resolved
  final DateTime createdAt;
  final DateTime? resolvedAt;

  /// Set by the server only on the reply to sending a doubt, when something
  /// needs saying: today's AI answers were used up, so it went to a mentor.
  final String? notice;

  const Doubt({
    required this.id,
    required this.subject,
    required this.body,
    this.imageUrl,
    this.aiAnswer,
    this.aiConfidence,
    this.humanAnswer,
    required this.status,
    required this.createdAt,
    this.resolvedAt,
    this.notice,
  });

  factory Doubt.fromJson(Map<String, dynamic> json) => Doubt(
        id: json['id'] as String,
        subject: json['subject'] as String,
        body: json['body'] as String,
        imageUrl: json['imageUrl'] as String?,
        aiAnswer: json['aiAnswer'] as String?,
        aiConfidence: (json['aiConfidence'] as num?)?.toDouble(),
        humanAnswer: json['humanAnswer'] as String?,
        status: json['status'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        resolvedAt: json['resolvedAt'] != null
            ? DateTime.parse(json['resolvedAt'] as String)
            : null,
        notice: json['notice'] as String?,
      );

  bool get hasAnswer => aiAnswer != null || humanAnswer != null;
  bool get isEscalated => status == 'escalated';
  bool get isResolved => status == 'resolved';
}
