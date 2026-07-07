import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/brand.dart';
import '../../core/auth/auth_provider.dart';

/// App shell: hosts the 5 bottom-nav tabs (Home · Learn · Exams · Live · Me)
/// with a persistent footer, a quick-action FAB, and a "compact sidebar" drawer
/// for secondary destinations.
class MainShell extends ConsumerWidget {
  final StatefulNavigationShell shell;
  const MainShell({super.key, required this.shell});

  static const _tabs = [
    _Tab(Icons.home_rounded, Icons.home_outlined, 'Home'),
    _Tab(Icons.menu_book_rounded, Icons.menu_book_outlined, 'Learn'),
    _Tab(Icons.assignment_rounded, Icons.assignment_outlined, 'Exams'),
    _Tab(Icons.sensors_rounded, Icons.sensors_outlined, 'Live'),
    _Tab(Icons.person_rounded, Icons.person_outline_rounded, 'Me'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Brand.bg,
      extendBody: true,
      drawer: _SideDrawer(ref: ref),
      body: shell,
      floatingActionButton: shell.currentIndex == 0
          ? FloatingActionButton(
              onPressed: () => context.push('/doubts'),
              backgroundColor: Brand.blue,
              elevation: 6,
              child: const Icon(Icons.auto_awesome, color: Colors.white),
            )
          : null,
      bottomNavigationBar: _BottomBar(
        tabs: _tabs,
        currentIndex: shell.currentIndex,
        onTap: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
      ),
    );
  }
}

class _Tab {
  final IconData active;
  final IconData inactive;
  final String label;
  const _Tab(this.active, this.inactive, this.label);
}

class _BottomBar extends StatelessWidget {
  final List<_Tab> tabs;
  final int currentIndex;
  final ValueChanged<int> onTap;

  const _BottomBar({required this.tabs, required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Brand.surface.withValues(alpha: 0.98),
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.06))),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 6),
        child: SizedBox(
          height: 60,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(tabs.length, (i) {
              final active = i == currentIndex;
              final tab = tabs[i];
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onTap(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOut,
                  padding: EdgeInsets.symmetric(horizontal: active ? 14 : 8, vertical: 8),
                  decoration: BoxDecoration(
                    color: active ? Brand.blue : Colors.transparent,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: active
                      // Active: horizontal pill (icon + label)
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(tab.active, color: Colors.white, size: 22),
                            const SizedBox(width: 6),
                            Text(tab.label,
                                style: const TextStyle(
                                    color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w700)),
                          ],
                        )
                      // Inactive: icon over small label
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(tab.inactive, color: Colors.white38, size: 22),
                            const SizedBox(height: 3),
                            Text(tab.label,
                                style: const TextStyle(color: Colors.white38, fontSize: 10)),
                          ],
                        ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

/// Compact sidebar drawer — secondary destinations that don't fit the footer.
class _SideDrawer extends StatelessWidget {
  final WidgetRef ref;
  const _SideDrawer({required this.ref});

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Drawer(
      backgroundColor: Brand.surface,
      width: 280,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: Brand.blue,
                    child: Text(
                      (user?.name.isNotEmpty == true ? user!.name[0] : 'A').toUpperCase(),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.name.isNotEmpty == true ? user!.name : 'Aspirant',
                            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                            overflow: TextOverflow.ellipsis),
                        Text(user?.phone ?? '',
                            style: const TextStyle(color: Colors.white38, fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Divider(color: Colors.white.withValues(alpha: 0.06)),
            _item(context, Icons.leaderboard_outlined, 'Leaderboard', '/leaderboard'),
            _item(context, Icons.track_changes_outlined, 'My Coach', '/coach'),
            _item(context, Icons.newspaper_outlined, 'Current Affairs', '/current-affairs'),
            _item(context, Icons.psychology_alt_outlined, 'AI Doubt Solver', '/doubts'),
            const Spacer(),
            Divider(color: Colors.white.withValues(alpha: 0.06)),
            ListTile(
              leading: const Icon(Icons.logout, color: Brand.red),
              title: const Text('Sign out', style: TextStyle(color: Brand.red)),
              onTap: () async {
                Navigator.of(context).pop();
                await ref.read(authProvider.notifier).clearAuth();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, String route) {
    return ListTile(
      leading: Icon(icon, color: Colors.white70),
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 14)),
      onTap: () {
        Navigator.of(context).pop();
        context.push(route);
      },
    );
  }
}
