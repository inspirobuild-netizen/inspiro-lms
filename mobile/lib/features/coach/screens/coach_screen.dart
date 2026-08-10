import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/coach_plan.dart';
import '../providers/coach_provider.dart';
import '../providers/plan_ticks_provider.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

class CoachScreen extends ConsumerWidget {
  const CoachScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final planAsync = ref.watch(coachPlanProvider);

    return AppScaffold(
      title: 'My Coach',
      body: planAsync.when(
        loading: () => const _GeneratingState(),
        error: (e, _) => ErrorRetry(
          message: e.toString().contains('503')
              ? 'Your coach is offline right now.'
              : 'Could not load your plan.',
          onRetry: () => ref.invalidate(coachPlanProvider),
        ),
        data: (plan) => RefreshIndicator(
          color: Brand.blue,
          backgroundColor: const Color(0xFF1A1F3A),
          onRefresh: () async => ref.invalidate(coachPlanProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _MotivationCard(plan: plan),
              const SizedBox(height: 16),
              if (plan.strengths.isNotEmpty || plan.weaknesses.isNotEmpty) ...[
                _StrengthWeaknessRow(plan: plan),
                const SizedBox(height: 16),
              ],
              const Padding(
                padding: EdgeInsets.only(left: 4, bottom: 10),
                child: Text('This week\'s plan',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold)),
              ),
              ...plan.weeklyPlan.map((day) => _DayCard(
                    day: day,
                    scopeKey: plan.generatedAt.toIso8601String(),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}

class _GeneratingState extends StatelessWidget {
  const _GeneratingState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: Brand.blue),
          SizedBox(height: 16),
          Text('Analysing your performance…',
              style: TextStyle(color: Colors.white54, fontSize: 13)),
          SizedBox(height: 4),
          Text('First load can take up to a minute',
              style: TextStyle(color: Colors.white24, fontSize: 11)),
        ],
      ),
    );
  }
}

class _MotivationCard extends StatelessWidget {
  final CoachPlan plan;
  const _MotivationCard({required this.plan});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Brand.blue, Color(0xFF0A46B4)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: Color(0xFFD3BBFF), size: 16),
              const SizedBox(width: 6),
              const Text('YOUR COACH SAYS',
                  style: TextStyle(
                      color: Color(0xFFD3BBFF),
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8)),
              const Spacer(),
              if (plan.atRisk)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFB95F).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text('NEEDS ATTENTION',
                      style: TextStyle(
                          color: Color(0xFFFFB95F),
                          fontSize: 9,
                          fontWeight: FontWeight.bold)),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(plan.motivation,
              style: const TextStyle(
                  color: Colors.white, fontSize: 14, height: 1.5)),
        ],
      ),
    );
  }
}

class _StrengthWeaknessRow extends StatelessWidget {
  final CoachPlan plan;
  const _StrengthWeaknessRow({required this.plan});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _TagPanel(
            title: 'Strong',
            icon: Icons.trending_up,
            color: const Color(0xFF4FDBC8),
            items: plan.strengths,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _TagPanel(
            title: 'Focus on',
            icon: Icons.trending_down,
            color: const Color(0xFFFFB95F),
            items: plan.weaknesses,
          ),
        ),
      ],
    );
  }
}

class _TagPanel extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final List<String> items;

  const _TagPanel({
    required this.title,
    required this.icon,
    required this.color,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1F3A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2A3050)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 14),
              const SizedBox(width: 5),
              Text(title,
                  style: TextStyle(
                      color: color, fontSize: 11, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          if (items.isEmpty)
            const Text('—', style: TextStyle(color: Colors.white38, fontSize: 12))
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: items
                  .map((s) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(s,
                            style: TextStyle(color: color, fontSize: 11)),
                      ))
                  .toList(),
            ),
        ],
      ),
    );
  }
}

class _DayCard extends ConsumerWidget {
  final PlanDay day;
  final String scopeKey;
  const _DayCard({required this.day, required this.scopeKey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticks = ref.watch(planTicksProvider(scopeKey));
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1F3A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF2A3050)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Brand.blue.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(day.day.toUpperCase(),
                    style: const TextStyle(
                        color: Color(0xFFD3BBFF),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(day.focus,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // These were plain icons with no tap handler — they looked exactly
          // like checkboxes a student could tick off, and did nothing. Now
          // they toggle and persist.
          ...day.tasks.indexed.map((entry) {
            final (i, task) = entry;
            final key = planTaskKey(day.day, i);
            final done = ticks.contains(key);
            return InkWell(
              onTap: () => ref.read(planTicksProvider(scopeKey).notifier).toggle(key),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Icon(
                        done ? Icons.check_box_rounded : Icons.check_box_outline_blank,
                        color: const Color(0xFF4FDBC8),
                        size: 16,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(task,
                          style: TextStyle(
                            color: done ? Colors.white38 : Colors.white70,
                            fontSize: 13,
                            height: 1.4,
                            decoration: done ? TextDecoration.lineThrough : null,
                            decorationColor: Colors.white38,
                          )),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
