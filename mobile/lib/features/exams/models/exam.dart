class Exam {
  final String id;
  final String title;
  final String subject;
  final String type; // practice | mock | sectional | live
  final int durationMins;
  final double negMarks;
  final double passPercent;

  const Exam({
    required this.id,
    required this.title,
    required this.subject,
    required this.type,
    required this.durationMins,
    this.negMarks = 0,
    this.passPercent = 40,
  });

  factory Exam.fromJson(Map<String, dynamic> json) => Exam(
        id: json['id'] as String,
        title: json['title'] as String,
        subject: (json['subject'] as String?) ?? 'General',
        type: (json['type'] as String?) ?? 'practice',
        durationMins: json['durationMins'] as int? ?? 30,
        negMarks: (json['negMarks'] as num?)?.toDouble() ?? 0,
        passPercent: (json['passPercent'] as num?)?.toDouble() ?? 40,
      );
}

/// A question as returned by the exam-start API (no correct answer — the server
/// scores on submit). `correct` is -1 for real exams, set for demo questions.
class ExamQuestionApi {
  final String id;
  final String subject;
  final double marks;
  final String body;
  final List<String> options;
  final int correct;

  const ExamQuestionApi({
    required this.id,
    required this.subject,
    required this.marks,
    required this.body,
    required this.options,
    this.correct = -1,
  });

  factory ExamQuestionApi.fromJson(Map<String, dynamic> json, {double marks = 2.0}) => ExamQuestionApi(
        id: json['id'] as String,
        subject: (json['subject'] as String?) ?? 'General',
        marks: marks,
        body: json['body'] as String,
        options: (json['options'] as List).cast<String>(),
      );
}

/// Started attempt: the attempt id + the question list.
class StartedAttempt {
  final String attemptId;
  final List<ExamQuestionApi> questions;
  const StartedAttempt({required this.attemptId, required this.questions});
}

/// Result after submission.
class ExamResult {
  final int total;
  final int correct;
  final int attempted;
  final double score;

  const ExamResult({required this.total, required this.correct, required this.attempted, required this.score});
}
