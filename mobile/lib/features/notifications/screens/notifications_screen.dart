import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../models/app_notification.dart';
import '../providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    final hasUnread = async.asData?.value.any((n) => n.isUnread) ?? false;

    Future<void> refresh() async {
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadCountProvider);
    }

    return AppScaffold(
      title: 'Notifications',
      actions: [
        if (hasUnread)
          TextButton(
            onPressed: () async {
              await NotificationsApi.markAllRead();
              await refresh();
            },
            child: const Text('Mark all read',
                style: TextStyle(color: Brand.blue, fontSize: 13, fontWeight: FontWeight.w600)),
          ),
      ],
      body: async.when(
        loading: () => const LoadingState(),
        error: (_, __) => ErrorRetry(
          message: 'Could not load notifications',
          onRetry: refresh,
        ),
        data: (items) {
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.notifications_none_rounded,
              title: 'No notifications yet',
              subtitle: 'Class reminders, exam alerts and admission updates will appear here.',
            );
          }
          return RefreshIndicator(
            color: Brand.blue,
            backgroundColor: Brand.surface,
            onRefresh: refresh,
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
              itemCount: items.length,
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _NotificationTile(
                  item: items[i],
                  onTap: () async {
                    if (items[i].isUnread) {
                      await NotificationsApi.markRead(items[i].id);
                      await refresh();
                    }
                  },
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final AppNotification item;
  final VoidCallback onTap;

  const _NotificationTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final s = item.style;
    return GlassCard(
      // Unread reads as slightly brighter with a dot, so the list scans fast.
      tint: item.isUnread ? Brand.surface2 : Brand.surface,
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: s.color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(s.icon, color: s.color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(item.title,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 14.5,
                            fontWeight: item.isUnread ? FontWeight.bold : FontWeight.w600,
                          )),
                    ),
                    if (item.isUnread) ...[
                      const SizedBox(width: 8),
                      Container(
                        width: 8, height: 8,
                        decoration: const BoxDecoration(color: Brand.blue, shape: BoxShape.circle),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(item.body,
                    style: const TextStyle(color: Colors.white54, fontSize: 12.5, height: 1.45)),
                const SizedBox(height: 6),
                Text(item.whenLabel,
                    style: const TextStyle(color: Colors.white30, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
