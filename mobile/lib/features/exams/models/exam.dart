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

/// One row of my attempt history (GET /exams/attempts).
class AttemptRow {
  final String attemptId;
  final String examId;
  final String examTitle;
  final String subject;
  final String type;
  final double score;
  final double maxScore;
  final int? rank;
  final DateTime? submittedAt;

  const AttemptRow({
    required this.attemptId,
    required this.examId,
    required this.examTitle,
    required this.subject,
    required this.type,
    required this.score,
    required this.maxScore,
    this.rank,
    this.submittedAt,
  });

  double get percent => maxScore <= 0 ? 0 : (score / maxScore * 100);
  bool get isSubmitted => submittedAt != null;

  factory AttemptRow.fromJson(Map<String, dynamic> json) {
    final a = json['attempt'] as Map<String, dynamic>;
    final e = json['exam'] as Map<String, dynamic>;
    return AttemptRow(
      attemptId: a['id'] as String,
      examId: e['id'] as String,
      examTitle: e['title'] as String,
      subject: (e['subject'] as String?) ?? 'General',
      type: (e['type'] as String?) ?? 'practice',
      score: (a['score'] as num?)?.toDouble() ?? 0,
      maxScore: (a['maxScore'] as num?)?.toDouble() ?? 0,
      rank: a['rank'] as int?,
      submittedAt: a['submittedAt'] != null ? DateTime.tryParse(a['submittedAt'] as String) : null,
    );
  }
}

/// Full post-exam review (GET /exams/:id/result) — score, per-subject
/// accuracy, and every question with the student's answer vs the correct one.
class ExamReview {
  final double score;
  final double maxScore;
  final double percentage;
  final bool passed;
  final int? rank;
  final List<SubjectBreakdown> subjects;
  final List<ReviewQuestion> questions;

  const ExamReview({
    required this.score,
    required this.maxScore,
    required this.percentage,
    required this.passed,
    required this.subjects,
    required this.questions,
    this.rank,
  });

  factory ExamReview.fromJson(Map<String, dynamic> json) {
    final a = json['attempt'] as Map<String, dynamic>;
    return ExamReview(
      score: (a['score'] as num?)?.toDouble() ?? 0,
      maxScore: (a['maxScore'] as num?)?.toDouble() ?? 0,
      percentage: (a['percentage'] as num?)?.toDouble() ?? 0,
      passed: a['passed'] as bool? ?? false,
      rank: a['rank'] as int?,
      subjects: (json['subjectBreakdown'] as List? ?? [])
          .cast<Map<String, dynamic>>()
          .map(SubjectBreakdown.fromJson)
          .toList(),
      questions: (json['questions'] as List? ?? [])
          .cast<Map<String, dynamic>>()
          .map(ReviewQuestion.fromJson)
          .toList(),
    );
  }
}

class SubjectBreakdown {
  final String subject;
  final int correct;
  final int total;

  const SubjectBreakdown({required this.subject, required this.correct, required this.total});

  factory SubjectBreakdown.fromJson(Map<String, dynamic> json) => SubjectBreakdown(
        subject: json['subject'] as String,
        correct: json['correct'] as int? ?? 0,
        total: json['total'] as int? ?? 0,
      );
}

class ReviewQuestion {
  final String body;
  final List<String> options;
  final int correctIndex;
  final int? studentAnswer;
  final bool isCorrect;
  final bool isSkipped;
  final String? explanation;
  final String subject;

  const ReviewQuestion({
    required this.body,
    required this.options,
    required this.correctIndex,
    required this.isCorrect,
    required this.isSkipped,
    required this.subject,
    this.studentAnswer,
    this.explanation,
  });

  factory ReviewQuestion.fromJson(Map<String, dynamic> json) => ReviewQuestion(
        body: json['body'] as String,
        options: (json['options'] as List).cast<String>(),
        correctIndex: json['correctIndex'] as int? ?? 0,
        studentAnswer: json['studentAnswer'] as int?,
        isCorrect: json['isCorrect'] as bool? ?? false,
        isSkipped: json['isSkipped'] as bool? ?? false,
        explanation: json['explanation'] as String?,
        subject: (json['subject'] as String?) ?? 'General',
      );
}
