import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../courses/models/course.dart';
import '../../courses/providers/courses_provider.dart';

class LearnScreen extends ConsumerWidget {
  const LearnScreen({super.key});

  // Icon + colour per subject (visual only).
  static const _subjectStyle = {
    'Polity': (Icons.account_balance, Brand.blue),
    'History': (Icons.history_edu, Brand.red),
    'Geography': (Icons.public, Brand.teal),
    'Economy': (Icons.trending_up, Brand.amber),
    'Science & Tech': (Icons.science, Color(0xFFA855F7)),
    'Environment': (Icons.eco, Color(0xFF22C55E)),
  };

  ({IconData icon, Color color}) _styleFor(String subject) {
    final s = _subjectStyle[subject];
    if (s != null) return (icon: s.$1, color: s.$2);
    return (icon: Icons.menu_book, color: Brand.blue);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);

    return TabPage(
      title: 'Learn',
      body: coursesAsync.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(message: 'Could not load courses', onRetry: () => ref.invalidate(coursesProvider)),
        data: (courses) {
          if (courses.isEmpty) {
            return const EmptyState(
              icon: Icons.menu_book_outlined,
              title: 'No courses yet',
              subtitle: 'Courses from your enrolled batch will appear here.',
            );
          }
          final featured = courses.take(3).toList();
          return RefreshIndicator(
            color: Brand.blue,
            backgroundColor: Brand.surface,
            onRefresh: () async => ref.invalidate(coursesProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
              children: [
                const SectionHeader(title: 'Continue learning'),
                SizedBox(
                  height: 168,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (var i = 0; i < featured.length; i++)
                        _ContinueCard(
                          course: featured[i],
                          percent: [0.65, 0.12, 0.4][i % 3],
                          color: _styleFor(featured[i].subject).color,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                const SectionHeader(title: 'All courses'),
                ...courses.map((c) {
                  final st = _styleFor(c.subject);
                  return _CourseTile(course: c, icon: st.icon, color: st.color);
                }),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ContinueCard extends StatelessWidget {
  final Course course;
  final double percent;
  final Color color;
  const _ContinueCard({required this.course, required this.percent, required this.color});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/course', extra: course.id),
      child: Container(
        width: 220,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 84,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [color.withValues(alpha: 0.7), color.withValues(alpha: 0.25)]),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              ),
              alignment: Alignment.bottomLeft,
              padding: const EdgeInsets.all(10),
              child: Text('${(percent * 100).round()}% done',
                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(course.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(course.subject, style: const TextStyle(color: Colors.white38, fontSize: 11)),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: percent,
                      minHeight: 5,
                      backgroundColor: Colors.white.withValues(alpha: 0.08),
                      valueColor: const AlwaysStoppedAnimation(Brand.teal),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CourseTile extends StatelessWidget {
  final Course course;
  final IconData icon;
  final Color color;
  const _CourseTile({required this.course, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        onTap: () => context.push('/course', extra: course.id),
        child: Row(
          children: [
            Container(
              width: 46, height: 46,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(course.title,
                      style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text(course.subject, style: const TextStyle(color: Colors.white38, fontSize: 12)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Colors.white24, size: 20),
          ],
        ),
      ),
    );
  }
}
