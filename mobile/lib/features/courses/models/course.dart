class Course {
  final String id;
  final String title;
  final String subject;
  final String? description;
  final String? thumbnailUrl;
  // Present on catalog (marketing) responses; absent/0 elsewhere.
  final double feeAmount;

  const Course({
    required this.id,
    required this.title,
    required this.subject,
    this.description,
    this.thumbnailUrl,
    this.feeAmount = 0,
  });

  factory Course.fromJson(Map<String, dynamic> json) => Course(
        id: json['id'] as String,
        title: json['title'] as String,
        subject: (json['subject'] as String?) ?? 'General',
        description: json['description'] as String?,
        thumbnailUrl: json['thumbnailUrl'] as String?,
        feeAmount: (json['feeAmount'] as num?)?.toDouble() ?? 0,
      );
}

/// A student's real progress through a course, computed server-side from
/// completed lessons. `total == 0` means the course has no lessons yet.
class CourseProgress {
  final int completed;
  final int total;
  final int percent;

  const CourseProgress({required this.completed, required this.total, required this.percent});

  factory CourseProgress.fromJson(Map<String, dynamic> json) => CourseProgress(
        completed: json['completed'] as int? ?? 0,
        total: json['total'] as int? ?? 0,
        percent: json['percent'] as int? ?? 0,
      );

  bool get hasLessons => total > 0;
}

/// A fee plan preset (mirrors the admin's fee_plans) — students pick one of
/// these, never type an amount.
class FeePlanOption {
  final String id;
  final String name;
  final double totalAmount;
  final List<FeeInstallment> installments;

  const FeePlanOption({required this.id, required this.name, required this.totalAmount, required this.installments});

  factory FeePlanOption.fromJson(Map<String, dynamic> json) => FeePlanOption(
        id: json['id'] as String,
        name: json['name'] as String,
        totalAmount: (json['totalAmount'] as num).toDouble(),
        installments: (json['installments'] as List? ?? [])
            .cast<Map<String, dynamic>>()
            .map(FeeInstallment.fromJson)
            .toList(),
      );
}

class FeeInstallment {
  final String label;
  final double amount;
  final int dueAfterDays;

  const FeeInstallment({required this.label, required this.amount, required this.dueAfterDays});

  factory FeeInstallment.fromJson(Map<String, dynamic> json) => FeeInstallment(
        label: json['label'] as String,
        amount: (json['amount'] as num).toDouble(),
        dueAfterDays: json['dueAfterDays'] as int? ?? 0,
      );
}

/// A lesson within a course module.
class CourseLesson {
  final String id;
  final String title;
  final String type; // video | pdf | quiz
  final int? duration; // seconds
  final bool isCompleted;
  final bool locked;

  const CourseLesson({
    required this.id,
    required this.title,
    required this.type,
    this.duration,
    this.isCompleted = false,
    this.locked = false,
  });

  factory CourseLesson.fromJson(Map<String, dynamic> json) => CourseLesson(
        id: json['id'] as String,
        title: json['title'] as String,
        type: (json['type'] as String?) ?? 'video',
        duration: json['duration'] as int?,
        // The API nests this under `progress`; the flat key is only ever
        // present in demo fixtures. Reading just the flat one meant every
        // lesson looked unfinished no matter how much had been watched.
        isCompleted: (json['progress'] as Map<String, dynamic>?)?['isCompleted'] as bool? ??
            json['isCompleted'] as bool? ??
            false,
        locked: json['locked'] as bool? ?? false,
      );

  String get durationLabel {
    if (duration == null) return '';
    final m = (duration! / 60).round();
    if (m >= 60) return '${(m / 60).floor()}h ${m % 60}m';
    return '$m mins';
  }
}

class CourseModule {
  final String id;
  final String title;
  final int order;
  final bool unlocked;
  final List<CourseLesson> lessons;

  const CourseModule({
    required this.id,
    required this.title,
    required this.order,
    this.unlocked = true,
    this.lessons = const [],
  });

  factory CourseModule.fromJson(Map<String, dynamic> json) => CourseModule(
        id: json['id'] as String,
        title: json['title'] as String,
        order: json['order'] as int? ?? 0,
        unlocked: json['unlocked'] as bool? ?? json['isUnlocked'] as bool? ?? true,
        lessons: (json['lessons'] as List?)
                ?.cast<Map<String, dynamic>>()
                .map(CourseLesson.fromJson)
                .toList() ??
            const [],
      );
}

class CourseDetail {
  final Course course;
  final List<CourseModule> modules;

  const CourseDetail({required this.course, required this.modules});

  int get lessonCount => modules.fold(0, (s, m) => s + m.lessons.length);
}
