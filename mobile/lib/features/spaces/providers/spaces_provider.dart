import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';

/// One activity as the student sees it, with their own submission state
/// folded in server-side — a single request renders the whole space.
class ActivityItem {
  final String id;
  final String title;
  final String description;
  final DateTime? dueAt;
  final DateTime createdAt;
  final String batchName;
  final String? submissionId;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? remarks;

  const ActivityItem({
    required this.id,
    required this.title,
    required this.description,
    required this.dueAt,
    required this.createdAt,
    required this.batchName,
    this.submissionId,
    this.submittedAt,
    this.reviewedAt,
    this.remarks,
  });

  bool get submitted => submissionId != null;
  bool get reviewed => reviewedAt != null;
  bool get overdue => !submitted && dueAt != null && dueAt!.isBefore(DateTime.now());

  factory ActivityItem.fromJson(Map<String, dynamic> j) => ActivityItem(
        id: j['id'] as String,
        title: j['title'] as String,
        description: j['description'] as String,
        dueAt: j['dueAt'] != null ? DateTime.tryParse(j['dueAt'] as String) : null,
        createdAt: DateTime.parse(j['createdAt'] as String),
        batchName: (j['batchName'] as String?) ?? '',
        submissionId: j['submissionId'] as String?,
        submittedAt: j['submittedAt'] != null ? DateTime.tryParse(j['submittedAt'] as String) : null,
        reviewedAt: j['reviewedAt'] != null ? DateTime.tryParse(j['reviewedAt'] as String) : null,
        remarks: j['remarks'] as String?,
      );
}

final myActivitiesProvider = FutureProvider.autoDispose<List<ActivityItem>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/activities/my');
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(ActivityItem.fromJson)
      .toList();
});

class FeedbackItem {
  final String category;
  final int? rating;
  final String message;
  final DateTime createdAt;

  const FeedbackItem({
    required this.category,
    required this.rating,
    required this.message,
    required this.createdAt,
  });

  factory FeedbackItem.fromJson(Map<String, dynamic> j) => FeedbackItem(
        category: j['category'] as String,
        rating: j['rating'] as int?,
        message: j['message'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
      );
}

final myFeedbackProvider = FutureProvider.autoDispose<List<FeedbackItem>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/feedback/my');
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(FeedbackItem.fromJson)
      .toList();
});
