import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../models/exam.dart';
import '../providers/exams_provider.dart';

/// Question-by-question review of a completed test: the student's answer,
/// the correct answer, and the explanation. Data comes straight from
/// GET /exams/:id/result — nothing is computed client-side.
class ExamReviewScreen extends ConsumerWidget {
  final String examId;
  final String title;
  const ExamReviewScreen({super.key, required this.examId, required this.title});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewAsync = ref.watch(examReviewProvider(examId));

    return AppScaffold(
      title: title,
      body: reviewAsync.when(
        loading: () => const LoadingState(message: 'Loading your result…'),
        error: (e, _) => ErrorRetry(
          message: 'Could not load this result',
          onRetry: () => ref.invalidate(examReviewProvider(examId)),
        ),
        data: (review) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          children: [
            _ScoreHeader(review: review),
            if (review.subjects.isNotEmpty) ...[
              const SizedBox(height: 18),
              const SectionHeader(title: 'Subject-wise'),
              ...review.subjects.map((s) => _SubjectRow(s: s)),
            ],
            const SizedBox(height: 18),
            SectionHeader(title: 'Questions (${review.questions.length})'),
            ...List.generate(
              review.questions.length,
              (i) => _QuestionCard(index: i + 1, q: review.questions[i]),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScoreHeader extends StatelessWidget {
  final ExamReview review;
  const _ScoreHeader({required this.review});

  @override
  Widget build(BuildContext context) {
    final color = review.passed ? Brand.teal : Brand.red;
    return GlassCard(
      child: Row(
        children: [
          Container(
            width: 74,
            height: 74,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.12)),
            alignment: Alignment.center,
            child: Text('${review.percentage.round()}%',
                style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(review.passed ? 'Passed 🎉' : 'Keep practising',
                    style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(height: 5),
                Text(
                  'Score ${_trim(review.score)} / ${_trim(review.maxScore)}'
                  '${review.rank != null ? '  ·  Rank #${review.rank}' : ''}',
                  style: const TextStyle(color: Colors.white54, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _trim(double n) => n == n.roundToDouble() ? n.round().toString() : n.toStringAsFixed(1);

class _SubjectRow extends StatelessWidget {
  final SubjectBreakdown s;
  const _SubjectRow({required this.s});

  @override
  Widget build(BuildContext context) {
    final acc = s.total == 0 ? 0.0 : s.correct / s.total;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(s.subject,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white70, fontSize: 13)),
          ),
          Expanded(
            flex: 4,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: acc,
                minHeight: 6,
                backgroundColor: Colors.white.withValues(alpha: 0.08),
                valueColor: AlwaysStoppedAnimation(acc >= 0.5 ? Brand.teal : Brand.amber),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text('${s.correct}/${s.total}',
              style: const TextStyle(color: Colors.white54, fontSize: 12.5)),
        ],
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  final int index;
  final ReviewQuestion q;
  const _QuestionCard({required this.index, required this.q});

  @override
  Widget build(BuildContext context) {
    final (badgeColor, badgeText) = q.isSkipped
        ? (Colors.white38, 'Skipped')
        : q.isCorrect
            ? (Brand.teal, 'Correct')
            : (Brand.red, 'Wrong');

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text('Q$index. ${q.body}',
                      style: const TextStyle(color: Colors.white, fontSize: 14.5, height: 1.45)),
                ),
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: badgeColor.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(badgeText,
                      style: TextStyle(color: badgeColor, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...List.generate(q.options.length, (i) {
              final isCorrectOpt = i == q.correctIndex;
              final isChosen = q.studentAnswer == i;
              Color border = Colors.white.withValues(alpha: 0.08);
              Color? fill;
              Widget? trailing;
              if (isCorrectOpt) {
                border = Brand.teal;
                fill = Brand.teal.withValues(alpha: 0.10);
                trailing = const Icon(Icons.check_circle, color: Brand.teal, size: 17);
              } else if (isChosen) {
                border = Brand.red;
                fill = Brand.red.withValues(alpha: 0.10);
                trailing = const Icon(Icons.cancel, color: Brand.red, size: 17);
              }
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: fill ?? Brand.surface2.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: border),
                ),
                child: Row(
                  children: [
                    Text(String.fromCharCode(65 + i),
                        style: const TextStyle(color: Colors.white38, fontSize: 12.5, fontWeight: FontWeight.w700)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(q.options[i],
                          style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.35)),
                    ),
                    if (trailing != null) trailing,
                  ],
                ),
              );
            }),
            if (q.explanation != null && q.explanation!.trim().isNotEmpty) ...[
              const SizedBox(height: 4),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Brand.blue.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Brand.blue.withValues(alpha: 0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('EXPLANATION',
                        style: TextStyle(color: Brand.blue, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 1)),
                    const SizedBox(height: 5),
                    Text(q.explanation!,
                        style: const TextStyle(color: Colors.white60, fontSize: 12.5, height: 1.5)),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
