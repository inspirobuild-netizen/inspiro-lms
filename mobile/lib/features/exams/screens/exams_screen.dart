import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
    final examsAsync = ref.watch(examsProvider);

    return TabPage(
      title: 'Exams',
      body: RefreshIndicator(
        color: Brand.blue,
        backgroundColor: Brand.surface,
        onRefresh: () async => ref.invalidate(examsProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                gradient: const LinearGradient(
                  colors: [Brand.blue, Color(0xFF0A46B4)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: const Row(
                children: [
                  _MiniStat(value: '73%', label: 'Avg. score'),
                  _Divider(),
                  _MiniStat(value: '18', label: 'Tests taken'),
                  _Divider(),
                  _MiniStat(value: '#8', label: 'Batch rank'),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const SectionHeader(title: 'Available tests'),
            ...examsAsync.when(
              loading: () => [const Padding(padding: EdgeInsets.only(top: 40), child: LoadingState())],
              error: (e, _) => [
                Padding(
                  padding: const EdgeInsets.only(top: 40),
                  child: ErrorRetry(message: 'Could not load exams', onRetry: () => ref.invalidate(examsProvider)),
                )
              ],
              data: (exams) {
                if (exams.isEmpty) {
                  return [
                    const Padding(
                      padding: EdgeInsets.only(top: 40),
                      child: EmptyState(
                        icon: Icons.assignment_outlined,
                        title: 'No tests yet',
                        subtitle: 'Mock tests and sectional exams from your batch will appear here.',
                      ),
                    )
                  ];
                }
                return exams
                    .map((e) => _ExamCard(exam: e, color: _typeColors[e.type] ?? Brand.blue))
                    .toList();
              },
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
