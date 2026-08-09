import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../courses/models/course.dart';
import '../../courses/providers/courses_provider.dart';
import '../../home/providers/home_stats_provider.dart';
import '../../home/providers/my_batch_provider.dart';

/// Course detail — video header, progress/streak cards and the lesson list.
/// Pulls real modules/lessons from the API (falls back to sample in Demo Mode).
class CourseDetailScreen extends ConsumerWidget {
  final String courseId;
  const CourseDetailScreen({super.key, required this.courseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(courseDetailProvider(courseId));
    final batchName = ref.watch(myCourseBatchesProvider).asData?.value[courseId];

    return Scaffold(
      backgroundColor: Brand.bg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/doubts'),
        backgroundColor: Brand.blue,
        icon: const Icon(Icons.auto_awesome, color: Colors.white),
        label: const Text('Ask AI Doubt', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: detailAsync.when(
        loading: () => const Stack(children: [_VideoHeader(), Positioned.fill(top: 240, child: LoadingState())]),
        error: (e, _) => Stack(children: [
          const _VideoHeader(),
          Positioned.fill(
            top: 240,
            child: ErrorRetry(message: 'Could not load this course', onRetry: () => ref.invalidate(courseDetailProvider(courseId))),
          ),
        ]),
        data: (detail) => _content(context, detail, batchName),
      ),
    );
  }

  Widget _content(BuildContext context, CourseDetail detail, String? batchName) {
    // Flatten modules → ordered lessons and compute per-lesson display state.
    final lessons = detail.modules.expand((m) => m.lessons).toList();
    final total = lessons.length;
    final completed = lessons.where((l) => l.isCompleted).length;
    final progress = total == 0 ? 0.0 : completed / total;
    bool watchingAssigned = false;

    // First non-completed, unlocked video lesson — what the header play button opens.
    CourseLesson? current;
    for (final l in lessons) {
      if (!l.isCompleted && !l.locked && l.type == 'video') {
        current = l;
        break;
      }
    }

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: _VideoHeader(
            progress: progress,
            onPlay: current == null
                ? null
                : () => context.push('/lesson-player', extra: {'lessonId': current!.id, 'title': current.title}),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(spacing: 8, runSpacing: 6, children: [
                  _chip('COURSE', Brand.blue),
                  _chip(detail.course.subject.toUpperCase(), Brand.teal),
                  // Which of this course's batches the student belongs to —
                  // course is the master, batch sits under it.
                  if (batchName != null) _chip(batchName.toUpperCase(), Brand.amber),
                ]),
                const SizedBox(height: 12),
                Text(detail.course.title,
                    style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.2)),
                const SizedBox(height: 12),
                Wrap(spacing: 16, runSpacing: 6, children: [
                  _Meta(Icons.menu_book, '$total Lessons', Colors.white54),
                  const _Meta(Icons.bar_chart, 'Intermediate', Colors.white54),
                  const _Meta(Icons.star, '4.9', Brand.teal),
                ]),
                const SizedBox(height: 18),
                Row(children: [
                  Expanded(child: _ProgressCard(percent: progress)),
                  const SizedBox(width: 12),
                  const Expanded(child: _StreakMini()),
                ]),
                const SizedBox(height: 24),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Course Content', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('$total Lessons', style: const TextStyle(color: Colors.white38, fontSize: 13)),
                ]),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
        if (total == 0)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: EmptyState(icon: Icons.play_lesson_outlined, title: 'No lessons yet', subtitle: 'Lessons will appear here once published.'),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
            sliver: SliverList.builder(
              itemCount: lessons.length,
              itemBuilder: (context, i) {
                final l = lessons[i];
                _LessonState state;
                if (l.isCompleted) {
                  state = _LessonState.completed;
                } else if (l.locked) {
                  state = _LessonState.locked;
                } else if (!watchingAssigned) {
                  watchingAssigned = true;
                  state = _LessonState.watching;
                } else {
                  state = _LessonState.upNext;
                }
                final playable = !l.locked && l.type == 'video';
                return _LessonTile(
                  title: '${(i + 1).toString().padLeft(2, '0')}. ${l.title}',
                  duration: l.durationLabel.isEmpty ? l.type : l.durationLabel,
                  state: state,
                  onTap: playable
                      ? () => context.push('/lesson-player', extra: {'lessonId': l.id, 'title': l.title})
                      : null,
                );
              },
            ),
          ),
      ],
    );
  }

  Widget _chip(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
      );
}

class _VideoHeader extends StatelessWidget {
  final double progress;
  final VoidCallback? onPlay;
  const _VideoHeader({this.progress = 0, this.onPlay});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        AspectRatio(
          aspectRatio: 16 / 10,
          child: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF0A2A4A), Color(0xFF0D3B34)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Center(
              child: GestureDetector(
                onTap: onPlay,
                child: Container(
                  width: 68, height: 68,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.15),
                    border: Border.all(color: Colors.white70, width: 2),
                  ),
                  child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 40),
                ),
              ),
            ),
          ),
        ),
        Positioned(
          left: 0, right: 0, bottom: 0,
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 4,
            backgroundColor: Colors.white24,
            valueColor: const AlwaysStoppedAnimation(Brand.teal),
          ),
        ),
        Positioned(
          top: 8, left: 8,
          child: SafeArea(
            child: CircleAvatar(
              backgroundColor: Colors.black38,
              child: IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Meta extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _Meta(this.icon, this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 15, color: color),
      const SizedBox(width: 5),
      Text(label, style: TextStyle(color: color, fontSize: 13)),
    ]);
  }
}

class _ProgressCard extends StatelessWidget {
  final double percent;
  const _ProgressCard({required this.percent});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('YOUR PROGRESS',
              style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
          const SizedBox(height: 8),
          Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            Text('${(percent * 100).round()}%', style: const TextStyle(color: Brand.blue, fontSize: 26, fontWeight: FontWeight.bold)),
            const SizedBox(width: 4),
            const Text('/ 100%', style: TextStyle(color: Colors.white38, fontSize: 12)),
          ]),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: percent,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              valueColor: const AlwaysStoppedAnimation(Brand.teal),
            ),
          ),
        ],
      ),
    );
  }
}

class _StreakMini extends ConsumerWidget {
  const _StreakMini();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final streak = ref.watch(homeStatsProvider).valueOrNull?.currentStreak;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('CURRENT STREAK',
              style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
          const SizedBox(height: 8),
          Row(children: [
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(color: Brand.amber.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(9)),
              child: const Icon(Icons.local_fire_department, color: Brand.amber, size: 20),
            ),
            const SizedBox(width: 8),
            Text('${streak ?? '—'}', style: const TextStyle(color: Brand.amber, fontSize: 26, fontWeight: FontWeight.bold)),
            const SizedBox(width: 4),
            const Padding(padding: EdgeInsets.only(bottom: 3), child: Text('Days', style: TextStyle(color: Colors.white54, fontSize: 13))),
          ]),
        ],
      ),
    );
  }
}

enum _LessonState { completed, watching, locked, upNext }

class _LessonTile extends StatelessWidget {
  final String title;
  final String duration;
  final _LessonState state;
  final VoidCallback? onTap;
  const _LessonTile({required this.title, required this.duration, required this.state, this.onTap});

  @override
  Widget build(BuildContext context) {
    final locked = state == _LessonState.locked;
    Color accent;
    IconData icon;
    String status;
    switch (state) {
      case _LessonState.completed:
        accent = Brand.teal;
        icon = Icons.check_circle;
        status = 'Completed';
        break;
      case _LessonState.watching:
        accent = Brand.blue;
        icon = Icons.play_circle_fill;
        status = 'Continue';
        break;
      case _LessonState.locked:
        accent = Colors.white24;
        icon = Icons.lock;
        status = 'Locked';
        break;
      case _LessonState.upNext:
        accent = Colors.white54;
        icon = Icons.play_circle_outline;
        status = 'Up Next';
        break;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: state == _LessonState.watching ? Brand.blue.withValues(alpha: 0.12) : Brand.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border(
          left: BorderSide(
            color: (state == _LessonState.completed || state == _LessonState.watching) ? accent : Colors.transparent,
            width: 3,
          ),
          top: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
          right: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
          bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
        ),
      ),
      child: ListTile(
        onTap: locked ? null : onTap,
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: accent.withValues(alpha: 0.15), shape: BoxShape.circle),
          child: Icon(icon, color: accent, size: 22),
        ),
        title: Text(title,
            style: TextStyle(color: locked ? Colors.white38 : Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text('$duration · $status',
              style: TextStyle(color: (state == _LessonState.upNext || locked) ? Colors.white38 : accent, fontSize: 12)),
        ),
      ),
    );
  }
}
