import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/current_affair.dart';
import '../providers/current_affairs_provider.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

class CurrentAffairsScreen extends ConsumerWidget {
  const CurrentAffairsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(currentAffairsProvider);

    return AppScaffold(
      title: 'Daily Current Affairs',
      body: feedAsync.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(
          message: 'Could not load the feed',
          onRetry: () => ref.invalidate(currentAffairsProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.newspaper_outlined,
              title: 'Digest being prepared',
              subtitle: "Today's current-affairs digest will appear here soon.",
            );
          }
          return RefreshIndicator(
            color: const Color(0xFF4FDBC8),
            backgroundColor: const Color(0xFF1A1F3A),
            onRefresh: () async => ref.invalidate(currentAffairsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              itemBuilder: (context, i) => _AffairCard(item: items[i]),
            ),
          );
        },
      ),
    );
  }
}

class _AffairCard extends StatelessWidget {
  final CurrentAffair item;
  const _AffairCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1F3A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2A3050)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: Row(
              children: [
                _CategoryChip(category: item.category),
                const SizedBox(width: 8),
                if (item.highRelevance) const _UpscBadge(),
                const Spacer(),
                Text(_relativeDate(item.publishedAt),
                    style: const TextStyle(color: Colors.white38, fontSize: 11)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
            child: Text(item.title,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    height: 1.35)),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Text(item.summary,
                style: const TextStyle(
                    color: Colors.white70, fontSize: 13, height: 1.5)),
          ),
          if (item.hasQuiz)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: _QuizSection(item: item),
            )
          else
            const SizedBox(height: 14),
        ],
      ),
    );
  }

  static String _relativeDate(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inHours < 1) return 'just now';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'yesterday';
    return '${dt.day}/${dt.month}';
  }
}

class _CategoryChip extends StatelessWidget {
  final String category;
  const _CategoryChip({required this.category});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Brand.blue.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(category.toUpperCase(),
          style: const TextStyle(
              color: Color(0xFFD3BBFF),
              fontSize: 10,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5)),
    );
  }
}

class _UpscBadge extends StatelessWidget {
  const _UpscBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFF4FDBC8).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.star, color: Color(0xFF4FDBC8), size: 10),
          SizedBox(width: 3),
          Text('EXAM RELEVANT',
              style: TextStyle(
                  color: Color(0xFF4FDBC8),
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5)),
        ],
      ),
    );
  }
}

class _QuizSection extends StatefulWidget {
  final CurrentAffair item;
  const _QuizSection({required this.item});

  @override
  State<_QuizSection> createState() => _QuizSectionState();
}

class _QuizSectionState extends State<_QuizSection> {
  int? _selected;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;

    if (!_expanded) {
      return GestureDetector(
        onTap: () => setState(() => _expanded = true),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFF13162A),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Brand.blue.withValues(alpha: 0.4)),
          ),
          child: const Row(
            children: [
              Icon(Icons.quiz_outlined, color: Color(0xFFD3BBFF), size: 18),
              SizedBox(width: 8),
              Text('Test yourself — 1 question',
                  style: TextStyle(
                      color: Color(0xFFD3BBFF),
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              Spacer(),
              Icon(Icons.expand_more, color: Colors.white38, size: 18),
            ],
          ),
        ),
      );
    }

    final answered = _selected != null;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF13162A),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.quizQuestion!,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  height: 1.4)),
          const SizedBox(height: 10),
          ...List.generate(item.quizOptions!.length, (i) {
            final isCorrect = i == item.quizCorrectIndex;
            final isChosen = i == _selected;

            Color border = const Color(0xFF2A3050);
            Color? fill;
            if (answered && isCorrect) {
              border = const Color(0xFF4FDBC8);
              fill = const Color(0xFF4FDBC8).withValues(alpha: 0.1);
            } else if (answered && isChosen && !isCorrect) {
              border = Colors.redAccent;
              fill = Colors.redAccent.withValues(alpha: 0.08);
            }

            return GestureDetector(
              onTap: answered ? null : () => setState(() => _selected = i),
              child: Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: fill ?? const Color(0xFF1A1F3A),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: border),
                ),
                child: Row(
                  children: [
                    Text(String.fromCharCode(65 + i),
                        style: const TextStyle(
                            color: Colors.white38,
                            fontSize: 12,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(item.quizOptions![i],
                          style:
                              const TextStyle(color: Colors.white, fontSize: 13)),
                    ),
                    if (answered && isCorrect)
                      const Icon(Icons.check_circle,
                          color: Color(0xFF4FDBC8), size: 16),
                    if (answered && isChosen && !isCorrect)
                      const Icon(Icons.cancel, color: Colors.redAccent, size: 16),
                  ],
                ),
              ),
            );
          }),
          if (answered)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _selected == item.quizCorrectIndex
                    ? 'Correct! 🎯'
                    : 'The right answer is ${String.fromCharCode(65 + item.quizCorrectIndex!)}.',
                style: TextStyle(
                    color: _selected == item.quizCorrectIndex
                        ? const Color(0xFF4FDBC8)
                        : const Color(0xFFFFB95F),
                    fontSize: 12,
                    fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ),
    );
  }
}
