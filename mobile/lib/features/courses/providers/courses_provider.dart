import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/course.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_fallback.dart';

// ── Sample fallback data (shown in Demo Mode when the API is unreachable) ──────
const _demoCourses = [
  Course(id: 'demo-1', title: 'Indian Constitution', subject: 'Polity',
      description: 'Comprehensive coverage of the Constitution for PSC & UPSC.'),
  Course(id: 'demo-2', title: 'Modern India', subject: 'History',
      description: 'From the 1857 revolt to independence.'),
  Course(id: 'demo-3', title: 'Physical Geography', subject: 'Geography',
      description: 'Climate, landforms and oceanography.'),
  Course(id: 'demo-4', title: 'Indian Economy', subject: 'Economy',
      description: 'Fundamentals of the Indian economy.'),
];

final coursesProvider = FutureProvider<List<Course>>((ref) async {
  return apiOrDemo(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>(
      '/api/v1/courses',
      queryParameters: {'limit': 50},
    );
    return (res.data!['data'] as List)
        .cast<Map<String, dynamic>>()
        .map(Course.fromJson)
        .toList();
  }, _demoCourses);
});

// ── Real per-course progress (completed / total lessons) ──────────────────────
/// courseId → percent complete, from the student's actual lesson progress.
/// Absent for a course means "no lessons yet" — callers show nothing rather
/// than a fabricated figure.
final courseProgressProvider = FutureProvider.autoDispose<Map<String, CourseProgress>>((ref) async {
  return apiOrDemo<Map<String, CourseProgress>>(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/me/course-progress');
    final rows = (res.data!['data'] as List).cast<Map<String, dynamic>>();
    return {
      for (final r in rows) r['courseId'] as String: CourseProgress.fromJson(r),
    };
  }, const {});
});

// ── Marketing catalog (browse-before-you-enrol) ───────────────────────────────
// Every published course with its price, regardless of enrolment. The server
// returns title/subject/description/fee only for this scope — no syllabus —
// so this can't be used to peek at locked content.
final catalogProvider = FutureProvider.autoDispose<List<Course>>((ref) async {
  return apiOrDemo(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>(
      '/api/v1/courses',
      queryParameters: {'limit': 50, 'scope': 'catalog'},
    );
    return (res.data!['data'] as List)
        .cast<Map<String, dynamic>>()
        .map(Course.fromJson)
        .toList();
  }, _demoCourses);
});

/// Preset fee plans for a course — the student picks one, never types a figure.
final courseFeePlansProvider =
    FutureProvider.autoDispose.family<List<FeePlanOption>, String>((ref, courseId) async {
  return apiOrDemo(() async {
    final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/catalog/courses/$courseId/fee-plans');
    return (res.data!['data'] as List)
        .cast<Map<String, dynamic>>()
        .map(FeePlanOption.fromJson)
        .toList();
  }, const <FeePlanOption>[]);
});

// ── Course detail (modules + lessons) ─────────────────────────────────────────
final courseDetailProvider =
    FutureProvider.family<CourseDetail, String>((ref, courseId) async {
  final demo = CourseDetail(
    course: _demoCourses.firstWhere((c) => c.id == courseId, orElse: () => _demoCourses.first),
    modules: const [
      CourseModule(id: 'm1', title: 'Foundations', order: 1, lessons: [
        CourseLesson(id: 'l1', title: '01. Historical Background', type: 'video', duration: 2700, isCompleted: true),
        CourseLesson(id: 'l2', title: '02. Making of the Constitution', type: 'video', duration: 3120),
      ]),
      CourseModule(id: 'm2', title: 'Core Concepts', order: 2, lessons: [
        CourseLesson(id: 'l3', title: '03. Salient Features', type: 'video', duration: 2280, locked: true),
        CourseLesson(id: 'l4', title: '04. The Preamble', type: 'video', duration: 4320, locked: true),
      ]),
    ],
  );

  return apiOrDemo(() async {
    // One request: the API nests lessons inside modules. It used to fetch the
    // course, then a request per module, so a student watched a spinner for
    // 1 + N round trips before any content appeared.
    final detailRes = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/courses/$courseId');
    final data = detailRes.data!['data'] as Map<String, dynamic>;
    final course = Course.fromJson(data);

    final modules = ((data['modules'] as List?) ?? const [])
        .cast<Map<String, dynamic>>()
        .map(CourseModule.fromJson)
        .toList();

    return CourseDetail(course: course, modules: modules);
  }, demo);
});
