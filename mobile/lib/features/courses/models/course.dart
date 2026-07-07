class Course {
  final String id;
  final String title;
  final String subject;
  final String? description;
  final String? thumbnailUrl;

  const Course({
    required this.id,
    required this.title,
    required this.subject,
    this.description,
    this.thumbnailUrl,
  });

  factory Course.fromJson(Map<String, dynamic> json) => Course(
        id: json['id'] as String,
        title: json['title'] as String,
        subject: (json['subject'] as String?) ?? 'General',
        description: json['description'] as String?,
        thumbnailUrl: json['thumbnailUrl'] as String?,
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
        isCompleted: json['isCompleted'] as bool? ?? false,
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
