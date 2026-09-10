import 'package:dio/dio.dart';
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
  /// The activity says what it expects back. Enforced server-side too — this
  /// is so the app can ask for the right thing rather than let a student
  /// write an answer that will be refused on submit.
  final bool requiresFile;
  final String allowedTypes;

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
    this.requiresFile = false,
    this.allowedTypes = 'image,pdf',
  });

  bool get allowsImage => allowedTypes.contains('image');
  bool get allowsPdf => allowedTypes.contains('pdf');

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
        requiresFile: j['requiresFile'] as bool? ?? false,
        allowedTypes: (j['allowedTypes'] as String?) ?? 'image,pdf',
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

/// A file the student has attached but not yet submitted.
class PendingAttachment {
  final String name;
  final String file;
  final String kind;
  const PendingAttachment({required this.name, required this.file, required this.kind});

  Map<String, dynamic> toJson() => {'name': name, 'file': file, 'kind': kind};
}

/// Uploads one file and returns the reference to attach to a submission.
///
/// Two steps rather than one multipart submit: a student photographing three
/// pages should see each one land, and a failure on the third should not throw
/// away the first two.
Future<PendingAttachment> uploadSubmissionFile(String path, String displayName) async {
  final form = FormData.fromMap({
    'file': await MultipartFile.fromFile(path, filename: displayName),
  });
  final res = await ApiClient.dio.post<Map<String, dynamic>>('/api/v1/media/submission', data: form);
  final d = res.data!['data'] as Map<String, dynamic>;
  return PendingAttachment(
    name: d['name'] as String? ?? displayName,
    file: d['file'] as String,
    kind: d['kind'] as String,
  );
}

/// Submits written work, attached files, or both.
Future<void> submitActivity(
  Ref ref,
  String activityId, {
  String? body,
  List<PendingAttachment> attachments = const [],
}) async {
  await ApiClient.dio.post<Map<String, dynamic>>(
    '/api/v1/activities/$activityId/submit',
    data: {
      if (body != null && body.trim().isNotEmpty) 'body': body.trim(),
      if (attachments.isNotEmpty) 'attachments': attachments.map((a) => a.toJson()).toList(),
    },
  );
  ref.invalidate(myActivitiesProvider);
}
