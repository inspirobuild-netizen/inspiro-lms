class PlanDay {
  final String day;
  final String focus;
  final List<String> tasks;

  const PlanDay({required this.day, required this.focus, required this.tasks});

  factory PlanDay.fromJson(Map<String, dynamic> json) => PlanDay(
        day: json['day'] as String,
        focus: json['focus'] as String,
        tasks: (json['tasks'] as List).cast<String>(),
      );
}

class CoachPlan {
  final List<String> strengths;
  final List<String> weaknesses;
  final List<PlanDay> weeklyPlan;
  final bool atRisk;
  final String motivation;
  final DateTime generatedAt;

  const CoachPlan({
    required this.strengths,
    required this.weaknesses,
    required this.weeklyPlan,
    required this.atRisk,
    required this.motivation,
    required this.generatedAt,
  });

  factory CoachPlan.fromJson(Map<String, dynamic> json) {
    final plan = json['plan'] as Map<String, dynamic>;
    return CoachPlan(
      strengths: (plan['strengths'] as List).cast<String>(),
      weaknesses: (plan['weaknesses'] as List).cast<String>(),
      weeklyPlan: (plan['weekly_plan'] as List)
          .cast<Map<String, dynamic>>()
          .map(PlanDay.fromJson)
          .toList(),
      atRisk: plan['at_risk'] as bool? ?? false,
      motivation: plan['motivation'] as String? ?? '',
      generatedAt: DateTime.parse(json['generatedAt'] as String),
    );
  }
}
