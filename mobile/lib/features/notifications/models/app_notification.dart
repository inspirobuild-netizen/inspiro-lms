import 'package:flutter/material.dart';
import '../../../core/theme/brand.dart';

class AppNotification {
  final String id;
  final String title;
  final String body;
  final String type;
  final DateTime createdAt;
  final DateTime? readAt;

  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.createdAt,
    this.readAt,
  });

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        type: (json['type'] as String?) ?? 'announcement',
        createdAt: DateTime.parse(json['createdAt'] as String),
        readAt: json['readAt'] != null ? DateTime.parse(json['readAt'] as String) : null,
      );

  /// Icon + colour per backend notification_type. Anything unrecognised falls
  /// back to a neutral bell rather than breaking the list.
  ({IconData icon, Color color}) get style => switch (type) {
        'class_reminder' => (icon: Icons.podcasts_rounded, color: Brand.teal),
        'exam_alert' => (icon: Icons.assignment_outlined, color: Brand.amber),
        'result' => (icon: Icons.emoji_events_outlined, color: Brand.amber),
        'doubt_reply' => (icon: Icons.forum_outlined, color: Brand.blue),
        'achievement' => (icon: Icons.workspace_premium_outlined, color: Brand.amber),
        'admission_update' => (icon: Icons.school_outlined, color: Brand.teal),
        'credentials_issued' => (icon: Icons.key_outlined, color: Brand.teal),
        'verification_update' => (icon: Icons.verified_outlined, color: Brand.blue),
        _ => (icon: Icons.campaign_outlined, color: Brand.blue),
      };

  /// Compact relative time — "just now", "5m", "3h", "2d", else a date.
  String get whenLabel {
    final d = DateTime.now().difference(createdAt);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    if (d.inDays < 7) return '${d.inDays}d ago';
    return '${createdAt.day}/${createdAt.month}/${createdAt.year}';
  }
}
