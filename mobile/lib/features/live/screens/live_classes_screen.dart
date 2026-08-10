import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../providers/live_provider.dart';
import '../models/live_class.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

class LiveClassesScreen extends ConsumerStatefulWidget {
  const LiveClassesScreen({super.key});

  @override
  ConsumerState<LiveClassesScreen> createState() => _LiveClassesScreenState();
}

class _LiveClassesScreenState extends ConsumerState<LiveClassesScreen> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // A class only becomes joinable when the backend assigns its agoraChannel,
    // and nothing pushes that to the client. Without a refresh a student
    // waiting on this page would never see the class go live — they'd have to
    // leave and come back. Poll while the screen is mounted.
    _poll = Timer.periodic(const Duration(seconds: 45), (_) {
      if (mounted) ref.invalidate(liveClassesProvider);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(liveClassesProvider);
    await ref.read(liveClassesProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final classesAsync = ref.watch(liveClassesProvider);

    return TabPage(
      title: 'Live Classes',
      body: RefreshIndicator(
        color: Brand.blue,
        backgroundColor: Brand.surface,
        onRefresh: _refresh,
        child: classesAsync.when(
          loading: () => const LoadingState(),
          error: (e, _) => ErrorRetry(
            message: 'Could not load live classes',
            onRetry: () => ref.invalidate(liveClassesProvider),
          ),
          data: (classes) {
            if (classes.isEmpty) {
              // Must stay scrollable, otherwise pull-to-refresh can't be
              // triggered on the one screen where a stale view matters most.
              return LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: const EmptyState(
                      icon: Icons.cast_for_education_outlined,
                      title: 'No live classes yet',
                      subtitle: 'Scheduled sessions from your batch will appear here.',
                    ),
                  ),
                ),
              );
            }

            final live = classes.where((c) => c.isLive).toList();
            final upcoming = classes.where((c) => c.isUpcoming).toList();
            final ended = classes.where((c) => c.isCompleted).toList();

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
              children: [
                if (live.isNotEmpty) ...[
                  const _Label(label: 'LIVE NOW', color: Brand.red),
                  ...live.map((c) => _ClassCard(liveClass: c)),
                  const SizedBox(height: 18),
                ],
                if (upcoming.isNotEmpty) ...[
                  const _Label(label: 'UPCOMING', color: Color(0xFF4FDBC8)),
                  ...upcoming.map((c) => _ClassCard(liveClass: c)),
                  const SizedBox(height: 18),
                ],
                if (ended.isNotEmpty) ...[
                  const _Label(label: 'ENDED', color: Colors.white24),
                  ...ended.map((c) => _ClassCard(liveClass: c)),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String label;
  final Color color;
  const _Label({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(width: 3, height: 14, color: color, margin: const EdgeInsets.only(right: 8)),
          Text(label,
              style: TextStyle(
                  color: color, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.4)),
        ],
      ),
    );
  }
}

class _ClassCard extends StatelessWidget {
  final LiveClass liveClass;
  const _ClassCard({required this.liveClass});

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('d MMM, h:mm a');
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        tint: liveClass.isLive ? Brand.red.withValues(alpha: 0.12) : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(liveClass.title,
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                ),
                if (liveClass.isLive)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Brand.red.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _Pulse(),
                        SizedBox(width: 5),
                        Text('LIVE',
                            style: TextStyle(
                                color: Brand.red, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(liveClass.subject, style: const TextStyle(color: Colors.white38, fontSize: 12)),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.schedule, size: 13, color: Colors.white38),
                const SizedBox(width: 4),
                Text(fmt.format(liveClass.startTime.toLocal()),
                    style: const TextStyle(color: Colors.white38, fontSize: 12)),
                const Spacer(),
                if (liveClass.isLive) _JoinButton(classId: liveClass.id, title: liveClass.title),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Pulse extends StatelessWidget {
  const _Pulse();
  @override
  Widget build(BuildContext context) => Container(
        width: 6, height: 6,
        decoration: const BoxDecoration(color: Brand.red, shape: BoxShape.circle),
      );
}

class _JoinButton extends ConsumerWidget {
  final String classId;
  final String title;
  const _JoinButton({required this.classId, required this.title});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(liveJoinProvider);
    return ElevatedButton(
      onPressed: state.loading
          ? null
          : () async {
              await ref.read(liveJoinProvider.notifier).join(classId);
              final result = ref.read(liveJoinProvider).result;
              if (result != null && context.mounted) {
                context.push('/live-class/$classId', extra: result);
              }
              if (ref.read(liveJoinProvider).error != null && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(ref.read(liveJoinProvider).error!), backgroundColor: Brand.red),
                );
              }
            },
      style: ElevatedButton.styleFrom(
        backgroundColor: Brand.red,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
      ),
      child: state.loading
          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : const Text('Join'),
    );
  }
}
