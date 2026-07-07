import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/leaderboard_provider.dart';
import '../models/leaderboard_entry.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(leaderboardPeriodProvider);
    final leaderboardAsync = ref.watch(leaderboardProvider);
    final streakAsync = ref.watch(myStreakProvider);
    final myId = ref.watch(authProvider).user?.id;

    return AppScaffold(
      title: 'Leaderboard',
      body: Column(
        children: [
          // Period selector
          _PeriodTabs(selected: period),

          // Streak banner
          streakAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (streak) => _StreakBanner(streak: streak),
          ),

          // My rank chip
          leaderboardAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (result) {
              if (result.meta.myRank == null) return const SizedBox.shrink();
              return _MyRankBanner(rank: result.meta.myRank!, score: result.meta.myScore ?? 0);
            },
          ),

          // List
          Expanded(
            child: leaderboardAsync.when(
              loading: () => const LoadingState(),
              error: (e, _) => ErrorRetry(
                message: 'Could not load the leaderboard',
                onRetry: () => ref.invalidate(leaderboardProvider),
              ),
              data: (result) {
                if (result.entries.isEmpty) {
                  return const Center(
                    child: Text('No data yet for this period.',
                        style: TextStyle(color: Colors.white54)),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  itemCount: result.entries.length,
                  itemBuilder: (context, i) => _EntryRow(
                    entry: result.entries[i],
                    isMe: result.entries[i].student.id == myId,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodTabs extends ConsumerWidget {
  final String selected;
  const _PeriodTabs({required this.selected});

  static const _tabs = [
    ('weekly', 'This Week'),
    ('monthly', 'This Month'),
    ('all_time', 'All Time'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      color: const Color(0xFF181B2A),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: _tabs.map((tab) {
          final active = tab.$1 == selected;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                ref.read(leaderboardPeriodProvider.notifier).state = tab.$1;
                ref.invalidate(leaderboardProvider);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: active
                      ? Brand.blue
                      : Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  tab.$2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: active ? Colors.white : Colors.white38,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _StreakBanner extends StatelessWidget {
  final Map<String, dynamic> streak;
  const _StreakBanner({required this.streak});

  @override
  Widget build(BuildContext context) {
    final current = (streak['currentStreak'] as int?) ?? 0;
    final longest = (streak['longestStreak'] as int?) ?? 0;
    final xp = (streak['totalXp'] as int?) ?? 0;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Brand.blue, Color(0xFF4FDBC8)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Text('🔥', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$current day streak',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              Text('Longest: $longest days',
                  style: const TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('$xp XP',
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              const Text('total',
                  style: TextStyle(color: Colors.white70, fontSize: 10)),
            ],
          ),
        ],
      ),
    );
  }
}

class _MyRankBanner extends StatelessWidget {
  final int rank;
  final double score;
  const _MyRankBanner({required this.rank, required this.score});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 6, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF181B2A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Brand.blue.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Text('Your rank',
              style: TextStyle(color: Colors.white54, fontSize: 13)),
          const Spacer(),
          Text('#$rank',
              style: const TextStyle(
                  color: Color(0xFFD3BBFF),
                  fontWeight: FontWeight.bold,
                  fontSize: 18)),
          const SizedBox(width: 16),
          Text('${score.toStringAsFixed(1)} pts',
              style: const TextStyle(color: Colors.white54, fontSize: 13)),
        ],
      ),
    );
  }
}

class _EntryRow extends StatelessWidget {
  final LeaderboardEntry entry;
  final bool isMe;
  const _EntryRow({required this.entry, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final rank = entry.rank ?? 0;
    final medal = rank == 1
        ? '🥇'
        : rank == 2
            ? '🥈'
            : rank == 3
                ? '🥉'
                : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isMe
            ? Brand.blue.withValues(alpha: 0.15)
            : const Color(0xFF181B2A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isMe
              ? Brand.blue.withValues(alpha: 0.5)
              : Colors.white.withValues(alpha: 0.06),
        ),
      ),
      child: Row(
        children: [
          // Rank
          SizedBox(
            width: 36,
            child: medal != null
                ? Text(medal, style: const TextStyle(fontSize: 20))
                : Text(
                    '#$rank',
                    style: TextStyle(
                      color: isMe ? const Color(0xFFD3BBFF) : Colors.white38,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
          ),
          // Avatar
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Brand.blue.withValues(alpha: 0.3),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                entry.student.name.isNotEmpty
                    ? entry.student.name[0].toUpperCase()
                    : '?',
                style: const TextStyle(
                    color: Color(0xFFD3BBFF), fontWeight: FontWeight.bold),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Name
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.student.name,
                  style: TextStyle(
                    color: isMe ? const Color(0xFFD3BBFF) : Colors.white,
                    fontWeight: isMe ? FontWeight.bold : FontWeight.w500,
                    fontSize: 14,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  'Exam: ${entry.examScore.toStringAsFixed(0)} · Streak: ${entry.streakScore.toStringAsFixed(0)}',
                  style: const TextStyle(color: Colors.white38, fontSize: 11),
                ),
              ],
            ),
          ),
          // Score
          Text(
            entry.totalScore.toStringAsFixed(1),
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
          ),
        ],
      ),
    );
  }
}
