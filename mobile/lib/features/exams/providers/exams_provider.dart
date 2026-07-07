import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/exam.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_fallback.dart';

const _demoExams = [
  Exam(id: 'demo-e1', title: 'UPSC Prelims Mock #12', subject: 'General Studies', type: 'mock', durationMins: 120),
  Exam(id: 'demo-e2', title: 'Polity Sectional Test', subject: 'Indian Polity', type: 'sectional', durationMins: 30),
  Exam(id: 'demo-e3', title: 'Kerala PSC Full Test', subject: 'General Knowledge', type: 'mock', durationMins: 90),
  Exam(id: 'demo-e4', title: 'Current Affairs Weekly', subject: 'July Week 1', type: 'practice', durationMins: 20),
];

final examsProvider = FutureProvider.autoDispose<List<Exam>>((ref) async {
  return apiOrDemo(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>(
      '/api/v1/exams',
      queryParameters: {'limit': 50},
    );
    return (res.data!['data'] as List)
        .cast<Map<String, dynamic>>()
        .map(Exam.fromJson)
        .toList();
  }, _demoExams);
});

/// Repository for the exam attempt lifecycle (start → submit).
class ExamRepository {
  /// Starts (or resumes) an attempt and returns the attempt id + questions.
  static Future<StartedAttempt> start(String examId) async {
    final res = await ApiClient.dio.post<Map<String, dynamic>>('/api/v1/exams/$examId/start');
    final data = res.data!['data'] as Map<String, dynamic>;
    final attempt = data['attempt'] as Map<String, dynamic>;
    final questions = (data['questions'] as List)
        .cast<Map<String, dynamic>>()
        .map((q) => ExamQuestionApi.fromJson(q))
        .toList();
    return StartedAttempt(attemptId: attempt['id'] as String, questions: questions);
  }

  /// Submits answers ({questionId: optionIndex}) and returns the scored result.
  static Future<ExamResult> submit(
    String examId,
    String attemptId,
    Map<String, int> answers,
    int total,
  ) async {
    final res = await ApiClient.dio.post<Map<String, dynamic>>(
      '/api/v1/exams/$examId/attempts/$attemptId/submit',
      data: {'answers': answers},
    );
    final d = res.data!['data'] as Map<String, dynamic>;
    final score = (d['score'] as num?)?.toDouble() ?? 0;
    final correct = d['correctCount'] as int? ?? (d['correct'] as int? ?? 0);
    return ExamResult(total: total, correct: correct, attempted: answers.length, score: score);
  }
}
