import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../home/providers/home_stats_provider.dart';
import '../providers/my_batch_provider.dart';

class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final name = user?.name.trim().isNotEmpty == true ? user!.name.trim() : 'Aspirant';

    return TabPage(
      title: 'My Profile',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        children: [
          // Profile header
          GlassCard(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [Brand.blue, Color(0xFF0A46B4)]),
                  ),
                  alignment: Alignment.center,
                  child: Text(name[0].toUpperCase(),
                      style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(user?.phone ?? '',
                          style: const TextStyle(color: Colors.white54, fontSize: 13)),
                      Builder(builder: (context) {
                        final batchName = ref.watch(myBatchProvider).valueOrNull;
                        if (batchName == null || batchName.isEmpty) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                            decoration: BoxDecoration(
                              color: Brand.amber.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(batchName,
                                style: const TextStyle(color: Brand.amber, fontSize: 11, fontWeight: FontWeight.w600)),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Builder(builder: (context) {
            final statsAsync = ref.watch(homeStatsProvider);
            final stats = statsAsync.valueOrNull;
            return Row(
              children: [
                Expanded(child: _Stat(value: '${stats?.currentStreak ?? '—'}', label: 'Day streak', color: Brand.red)),
                const SizedBox(width: 12),
                Expanded(child: _Stat(value: stats?.rank != null ? '#${stats!.rank}' : '—', label: 'Rank', color: Brand.amber)),
                const SizedBox(width: 12),
                Expanded(child: _Stat(value: stats != null ? formatXp(stats.totalXp) : '—', label: 'XP', color: Brand.teal)),
              ],
            );
          }),
          const SizedBox(height: 24),
          const SectionHeader(title: 'Account'),
          _MenuGroup(items: [
            _MenuItem(Icons.leaderboard_outlined, 'Leaderboard', () => context.push('/leaderboard')),
            _MenuItem(Icons.track_changes_outlined, 'My Coach', () => context.push('/coach')),
            _MenuItem(Icons.card_membership_outlined, 'Subscription', () => context.push('/subscription')),
            _MenuItem(Icons.notifications_none_rounded, 'Notifications', () => context.push('/notifications')),
          ]),
          const SizedBox(height: 16),
          const SectionHeader(title: 'Support'),
          _MenuGroup(items: [
            _MenuItem(Icons.info_outline_rounded, 'About Inspiro', () => _showAbout(context)),
          ]),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async => ref.read(authProvider.notifier).clearAuth(),
            style: OutlinedButton.styleFrom(
              foregroundColor: Brand.red,
              side: BorderSide(color: Brand.red.withValues(alpha: 0.4)),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            icon: const Icon(Icons.logout, size: 18),
            label: const Text('Sign out', style: TextStyle(fontWeight: FontWeight.w600)),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text('Inspiro IAS Academy · v1.0.0',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.25), fontSize: 11)),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _Stat({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        children: [
          Text(value, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11)),
        ],
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  const _MenuItem(this.icon, this.label, this.onTap);
}

class _MenuGroup extends StatelessWidget {
  final List<_MenuItem> items;
  const _MenuGroup({required this.items});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: List.generate(items.length, (i) {
          final it = items[i];
          return Column(
            children: [
              ListTile(
                leading: Icon(it.icon, color: Colors.white70, size: 22),
                title: Text(it.label, style: const TextStyle(color: Colors.white, fontSize: 14)),
                trailing: const Icon(Icons.chevron_right, color: Colors.white24, size: 20),
                onTap: it.onTap ??
                    () => ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: Brand.surface,
                            content: Text('${it.label} — coming soon', style: const TextStyle(color: Colors.white)),
                          ),
                        ),
              ),
              if (i < items.length - 1)
                Divider(height: 1, color: Colors.white.withValues(alpha: 0.05), indent: 56),
            ],
          );
        }),
      ),
    );
  }
}

// Keep in sync with `version:` in pubspec.yaml — shown to students and useful
// when they report a problem.
const String _kAppVersion = '1.0.0';

void _showAbout(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Brand.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 34),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 22),
          const Center(child: InspiroLogo(height: 46)),
          const SizedBox(height: 18),
          const Text('Inspiro IAS Academy',
              style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text(
            'Your civil services preparation companion — courses, live classes, '
            'mock tests and an AI study coach.',
            style: TextStyle(color: Colors.white54, fontSize: 13, height: 1.5),
          ),
          const SizedBox(height: 18),
          const Row(
            children: [
              Icon(Icons.tag, color: Colors.white24, size: 16),
              SizedBox(width: 8),
              Text('App version $_kAppVersion',
                  style: TextStyle(color: Colors.white38, fontSize: 12.5)),
            ],
          ),
        ],
      ),
    ),
  );
}
