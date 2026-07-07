import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/brand.dart';
import '../../core/widgets/app_ui.dart';
import '../courses/models/course.dart';
import '../courses/providers/courses_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final firstName = (user?.name.trim().isNotEmpty == true)
        ? user!.name.trim().split(' ').first
        : 'Aspirant';

    return Stack(
      children: [
        const AmbientBackground(),
        SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              _Header(greeting: _greeting(), name: firstName),
              const SizedBox(height: 20),
              const _StreakCard(),
              const SizedBox(height: 16),
              const _LiveNowCard(),
              const SizedBox(height: 24),
              SectionHeader(title: 'Continue learning', actionLabel: 'View all', onAction: () => context.go('/learn')),
              const _ContinueLearning(),
              const SizedBox(height: 24),
              const _RankCard(),
              const SizedBox(height: 16),
              const _ToolsRow(),
            ],
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final String greeting;
  final String name;
  const _Header({required this.greeting, required this.name});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Builder(
          builder: (ctx) => GestureDetector(
            onTap: () => Scaffold.of(ctx).openDrawer(),
            child: Container(
              width: 46, height: 46,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [Brand.blue, Color(0xFF0A46B4)]),
              ),
              alignment: Alignment.center,
              child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$greeting,', style: const TextStyle(color: Colors.white54, fontSize: 13)),
              Text(name,
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                  overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_none_rounded, color: Colors.white70, size: 22),
          ),
        ),
      ],
    );
  }
}

class _StreakCard extends StatelessWidget {
  const _StreakCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.local_fire_department, color: Brand.amber, size: 30),
              const SizedBox(width: 6),
              const Text('14',
                  style: TextStyle(color: Brand.amber, fontSize: 30, fontWeight: FontWeight.bold)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Brand.blue.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.star, color: Brand.blue, size: 14),
                    SizedBox(width: 4),
                    Text('+20 XP', style: TextStyle(color: Brand.blue, fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text('Daily Streak',
              style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('Keep it going! 3 more days to your next milestone.',
              style: TextStyle(color: Colors.white54, fontSize: 13)),
        ],
      ),
    );
  }
}

class _LiveNowCard extends StatelessWidget {
  const _LiveNowCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(18),
        border: const Border(left: BorderSide(color: Brand.teal, width: 3)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 20, offset: const Offset(0, 8))],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 7, height: 7, decoration: const BoxDecoration(color: Brand.teal, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              const Text('LIVE NOW',
                  style: TextStyle(color: Brand.teal, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  color: Brand.teal.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.account_balance, color: Brand.teal, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Indian Polity: Fundamental Rights',
                        style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text('with Dr. Shreyas Verma · 420 watching',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => context.go('/live'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Brand.teal,
                foregroundColor: const Color(0xFF00201C),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
              child: const Text('Join'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContinueLearning extends ConsumerWidget {
  const _ContinueLearning();

  static const _colors = [Brand.blue, Brand.red, Brand.teal];
  static const _percents = [0.65, 0.12, 0.45];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);
    return SizedBox(
      height: 172,
      child: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Brand.blue)),
        error: (_, __) => const SizedBox.shrink(),
        data: (courses) {
          final featured = courses.take(3).toList();
          if (featured.isEmpty) return const SizedBox.shrink();
          return ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (var i = 0; i < featured.length; i++)
                _CourseCard(
                  course: featured[i],
                  percent: _percents[i % _percents.length],
                  color: _colors[i % _colors.length],
                ),
            ],
          );
        },
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  final double percent;
  final Color color;
  const _CourseCard({required this.course, required this.percent, required this.color});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/course', extra: course.id),
      child: Container(
      width: 230,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              Container(
                height: 82,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [color.withValues(alpha: 0.75), color.withValues(alpha: 0.2)]),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
              ),
              Positioned(
                left: 10, bottom: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(6)),
                  child: Text('${(percent * 100).round()}% done',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
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

class _RankCard extends StatelessWidget {
  const _RankCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: () => context.push('/leaderboard'),
      child: Row(
        children: [
          Container(
            width: 52, height: 52,
            decoration: BoxDecoration(
              color: Brand.amber.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.emoji_events, color: Brand.amber, size: 26),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your Rank: #47',
                    style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                SizedBox(height: 2),
                Text('Batch UPSC-2026-A', style: TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),
          ),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Row(
                children: [
                  Icon(Icons.trending_up, color: Brand.teal, size: 16),
                  SizedBox(width: 4),
                  Text('Up 12', style: TextStyle(color: Brand.teal, fontSize: 13, fontWeight: FontWeight.bold)),
                ],
              ),
              SizedBox(height: 4),
              Text('Leaderboard ›', style: TextStyle(color: Brand.blue, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _ToolsRow extends StatelessWidget {
  const _ToolsRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _Tool(Icons.psychology_alt_outlined, 'Ask AI', Brand.blue, () => context.push('/doubts')),
        const SizedBox(width: 12),
        _Tool(Icons.track_changes_outlined, 'Coach', Brand.amber, () => context.push('/coach')),
        const SizedBox(width: 12),
        _Tool(Icons.newspaper_outlined, 'Affairs', Brand.teal, () => context.push('/current-affairs')),
      ],
    );
  }
}

class _Tool extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _Tool(this.icon, this.label, this.color, this.onTap);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GlassCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 8),
            Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
