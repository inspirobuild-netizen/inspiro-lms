class CurrentAffair {
  final String id;
  final String title;
  final String summary;
  final String category;
  final String? sourceUrl;
  final double upscRelevance;
  final String? quizQuestion;
  final List<String>? quizOptions;
  final int? quizCorrectIndex;
  final DateTime publishedAt;

  const CurrentAffair({
    required this.id,
    required this.title,
    required this.summary,
    required this.category,
    this.sourceUrl,
    required this.upscRelevance,
    this.quizQuestion,
    this.quizOptions,
    this.quizCorrectIndex,
    required this.publishedAt,
  });

  factory CurrentAffair.fromJson(Map<String, dynamic> json) => CurrentAffair(
        id: json['id'] as String,
        title: json['title'] as String,
        summary: json['summary'] as String,
        category: json['category'] as String,
        sourceUrl: json['sourceUrl'] as String?,
        upscRelevance: (json['upscRelevance'] as num?)?.toDouble() ?? 0,
        quizQuestion: json['quizQuestion'] as String?,
        quizOptions:
            (json['quizOptions'] as List?)?.cast<String>(),
        quizCorrectIndex: json['quizCorrectIndex'] as int?,
        publishedAt: DateTime.parse(json['publishedAt'] as String),
      );

  bool get hasQuiz =>
      quizQuestion != null && quizOptions != null && quizCorrectIndex != null;
  bool get highRelevance => upscRelevance >= 0.7;
}
