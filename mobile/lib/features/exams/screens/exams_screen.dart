import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../models/exam.dart';
import '../providers/exams_provider.dart';

class ExamsScreen extends ConsumerWidget {
  const ExamsScreen({super.key});

  static const _typeColors = {
    'mock': Brand.blue,
    'sectional': Brand.teal,
    'practice': Brand.red,
    'live': Color(0xFFA855F7),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final attemptsAsync = ref.watch(myAttemptsProvider);
    final attempts = attemptsAsync.asData?.value ?? const <AttemptRow>[];

    return TabPage(
      title: 'Exams',
      body: DefaultTabController(
        length: 2,
        child: Column(
          children: [
            // Real stats from real attempts — no invented numbers. Shows an
            // em-dash until the student has actually taken a test.
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: const LinearGradient(
                    colors: [Brand.blue, Color(0xFF0A46B4)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Row(
                  children: [
                    _MiniStat(
                      value: attempts.isEmpty
                          ? '—'
                          : '${(attempts.map((a) => a.percent).reduce((x, y) => x + y) / attempts.length).round()}%',
                      label: 'Avg. score',
                    ),
                    const _Divider(),
                    _MiniStat(value: attempts.isEmpty ? '—' : '${attempts.length}', label: 'Tests taken'),
                    const _Divider(),
                    _MiniStat(
                      value: attempts.firstOrNull?.rank != null ? '#${attempts.first.rank}' : '—',
                      label: 'Latest rank',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                decoration: BoxDecoration(
                  color: Brand.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
                ),
                child: TabBar(
                  indicator: BoxDecoration(color: Brand.blue, borderRadius: BorderRadius.circular(12)),
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicatorPadding: const EdgeInsets.all(4),
                  dividerColor: Colors.transparent,
                  labelColor: Colors.white,
                  unselectedLabelColor: Colors.white54,
                  labelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
                  tabs: const [
                    Tab(height: 42, text: 'New tests'),
                    Tab(height: 42, text: 'Attended'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Expanded(
              child: TabBarView(
                children: [
                  const _NewTestsTab(typeColors: _typeColors),
                  _AttendedTab(attemptsAsync: attemptsAsync),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Tab 1: available tests ──────────────────────────────────────────────────────
class _NewTestsTab extends ConsumerWidget {
  final Map<String, Color> typeColors;
  const _NewTestsTab({required this.typeColors});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final examsAsync = ref.watch(examsProvider);

    return RefreshIndicator(
      color: Brand.blue,
      backgroundColor: Brand.surface,
      onRefresh: () async {
        ref.invalidate(examsProvider);
        ref.invalidate(myAttemptsProvider);
      },
      child: examsAsync.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(message: 'Could not load exams', onRetry: () => ref.invalidate(examsProvider)),
        data: (exams) {
          if (exams.isEmpty) {
            return const EmptyState(
              icon: Icons.assignment_outlined,
              title: 'No tests yet',
              subtitle: 'Mock tests and sectional exams from your batch will appear here.',
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: exams
                .map((e) => _ExamCard(exam: e, color: typeColors[e.type] ?? Brand.blue))
                .toList(),
          );
        },
      ),
    );
  }
}

// ── Tab 2: attempt history ──────────────────────────────────────────────────────
class _AttendedTab extends ConsumerWidget {
  final AsyncValue<List<AttemptRow>> attemptsAsync;
  const _AttendedTab({required this.attemptsAsync});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      color: Brand.blue,
      backgroundColor: Brand.surface,
      onRefresh: () async => ref.invalidate(myAttemptsProvider),
      child: attemptsAsync.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(
          message: 'Could not load your attempts',
          onRetry: () => ref.invalidate(myAttemptsProvider),
        ),
        data: (attempts) {
          if (attempts.isEmpty) {
            return const EmptyState(
              icon: Icons.history_edu_outlined,
              title: 'Nothing attended yet',
              subtitle: 'Finish a test from the New tests tab and it will show up here with your answers.',
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: attempts.map((a) => _AttemptCard(attempt: a)).toList(),
          );
        },
      ),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  final AttemptRow attempt;
  const _AttemptCard({required this.attempt});

  @override
  Widget build(BuildContext context) {
    final pct = attempt.percent;
    final color = pct >= 40 ? Brand.teal : Brand.red;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        onTap: () => context.push('/exam-review', extra: {'examId': attempt.examId, 'title': attempt.examTitle}),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.12)),
              alignment: Alignment.center,
              child: Text('${pct.round()}%',
                  style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(attempt.examTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(
                    [
                      attempt.subject,
                      if (attempt.submittedAt != null) DateFormat('d MMM yyyy').format(attempt.submittedAt!),
                      if (attempt.rank != null) 'Rank #${attempt.rank}',
                    ].join(' · '),
                    style: const TextStyle(color: Colors.white38, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Column(
              children: [
                Icon(Icons.fact_check_outlined, color: Brand.blue, size: 20),
                SizedBox(height: 3),
                Text('Review', style: TextStyle(color: Brand.blue, fontSize: 10.5, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String value;
  final String label;
  const _MiniStat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => Container(width: 1, height: 34, color: Colors.white.withValues(alpha: 0.2));
}

class _ExamCard extends StatelessWidget {
  final Exam exam;
  final Color color;
  const _ExamCard({required this.exam, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(exam.title,
                      style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                  child: Text(exam.type.toUpperCase(),
                      style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(exam.subject, style: const TextStyle(color: Colors.white38, fontSize: 12)),
            const SizedBox(height: 14),
            Row(
              children: [
                _meta(Icons.timer_outlined, '${exam.durationMins} min'),
                const Spacer(),
                ElevatedButton(
                  onPressed: () => context.push('/exam-player', extra: exam),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Brand.blue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  child: const Text('Start'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _meta(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.white38),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(color: Colors.white54, fontSize: 12)),
      ],
    );
  }
}
