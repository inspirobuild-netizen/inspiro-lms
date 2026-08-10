import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/brand.dart';
import '../../core/widgets/app_ui.dart';
import '../courses/models/course.dart';
import '../courses/providers/courses_provider.dart';
import '../courses/widgets/course_thumb.dart';
import '../live/providers/live_provider.dart';
import 'providers/home_stats_provider.dart';
import 'providers/my_batch_provider.dart';

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
              // Self-hiding: renders nothing unless a class is actually live,
              // so it carries its own bottom spacing.
              const _LiveNowCard(),
              const SizedBox(height: 8),
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

class _StreakCard extends ConsumerWidget {
  const _StreakCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(homeStatsProvider);
    return statsAsync.when(
      loading: () => const GlassCard(
        padding: EdgeInsets.all(20),
        child: SizedBox(height: 78, child: Center(child: CircularProgressIndicator(color: Brand.amber))),
      ),
      error: (_, __) => const SizedBox.shrink(),
      data: (stats) {
        final streak = stats.currentStreak;
        final milestone = ((streak ~/ 5) + 1) * 5;
        final daysLeft = milestone - streak;
        final subtitle = streak == 0
            ? 'Start studying today to begin your streak!'
            : 'Keep it going! $daysLeft more day${daysLeft == 1 ? '' : 's'} to your next milestone.';

        return GlassCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.local_fire_department, color: Brand.amber, size: 30),
                  const SizedBox(width: 6),
                  Text('$streak',
                      style: const TextStyle(color: Brand.amber, fontSize: 30, fontWeight: FontWeight.bold)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Brand.blue.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.star, color: Brand.blue, size: 14),
                        const SizedBox(width: 4),
                        Text('${formatXp(stats.totalXp)} XP',
                            style: const TextStyle(color: Brand.blue, fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text('Daily Streak',
                  style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 13)),
            ],
          ),
        );
      },
    );
  }
}

/// Shows ONLY when a class is genuinely live (the backend sets `agoraChannel`
/// when a class goes on air). No live class → the card isn't rendered at all,
/// rather than advertising a session that doesn't exist.
class _LiveNowCard extends ConsumerWidget {
  const _LiveNowCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final live = ref.watch(liveClassesProvider).asData?.value
        .where((c) => c.isLive)
        .firstOrNull;
    if (live == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
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
                  child: const Icon(Icons.podcasts_rounded, color: Brand.teal, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(live.title,
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(live.subject,
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
      ),
    );
  }
}

class _ContinueLearning extends ConsumerWidget {
  const _ContinueLearning();

  static const _colors = [Brand.blue, Brand.red, Brand.teal];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);
    final batches = ref.watch(myCourseBatchesProvider).asData?.value ?? const {};
    final progress = ref.watch(courseProgressProvider).asData?.value ?? const {};

    return coursesAsync.when(
      loading: () => const SizedBox(
        height: 168,
        child: Center(child: CircularProgressIndicator(color: Brand.blue)),
      ),
      error: (_, __) => const SizedBox.shrink(),
      data: (courses) {
        final featured = courses.take(5).toList();
        if (featured.isEmpty) {
          // Not enrolled yet — point at the catalog instead of an empty rail.
          return _BrowseCoursesPrompt(onTap: () => context.push('/catalog'));
        }
        // Tall enough for thumb + title + subject + progress bar + batch chip.
        // Was 168, which overflowed by 9px once the progress bar was added.
        return SizedBox(
          height: 196,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: featured.length,
            itemBuilder: (_, i) => _CourseCard(
              course: featured[i],
              batchName: batches[featured[i].id],
              progress: progress[featured[i].id],
              color: _colors[i % _colors.length],
            ),
          ),
        );
      },
    );
  }
}

class _BrowseCoursesPrompt extends StatelessWidget {
  final VoidCallback onTap;
  const _BrowseCoursesPrompt({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Brand.blue.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.storefront_rounded, color: Brand.blue, size: 24),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Find your course',
                    style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                SizedBox(height: 3),
                Text('Browse our courses and enrol to start learning',
                    style: TextStyle(color: Colors.white38, fontSize: 12.5, height: 1.4)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: Colors.white24),
        ],
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  final String? batchName;
  final CourseProgress? progress;
  final Color color;
  const _CourseCard({
    required this.course,
    required this.batchName,
    required this.progress,
    required this.color,
  });

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
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Real course image when the admin has set one; the subject-tinted
            // block is the fallback. (Was a gradient placeholder that ignored
            // thumbnailUrl entirely.)
            Stack(
              children: [
                CourseThumb(
                  url: course.thumbnailUrl,
                  fallbackIcon: Icons.menu_book_rounded,
                  fallbackColor: color,
                  width: double.infinity,
                  height: 84,
                  borderRadius: BorderRadius.zero,
                ),
                // Only when the course actually has lessons — a "0% done"
                // badge on an empty course is noise, not information.
                if (progress != null && progress!.hasLessons)
                  Positioned(
                    left: 8, bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('${progress!.percent}% done',
                          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                  ),
              ],
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(course.title,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(course.subject,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    const Spacer(),
                    if (progress != null && progress!.hasLessons) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: progress!.percent / 100,
                          minHeight: 4,
                          backgroundColor: Colors.white.withValues(alpha: 0.08),
                          valueColor: const AlwaysStoppedAnimation(Brand.teal),
                        ),
                      ),
                      const SizedBox(height: 6),
                    ],
                    // The student's batch in this course — course is the master,
                    // so this is the "which batch am I in" answer.
                    if (batchName != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Brand.amber.withValues(alpha: 0.13),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(batchName!,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Brand.amber, fontSize: 10.5, fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RankCard extends ConsumerWidget {
  const _RankCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(homeStatsProvider);
    final rank = statsAsync.valueOrNull?.rank;

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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(rank != null ? 'Your Rank: #$rank' : 'Not ranked yet',
                    style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 2),
                Text(rank != null ? 'All India · All time' : 'Study to earn your first rank',
                    style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),
          ),
          const Text('Leaderboard ›', style: TextStyle(color: Brand.blue, fontSize: 12, fontWeight: FontWeight.w600)),
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
