import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../providers/spaces_provider.dart';

/// Activity space: tasks the mentor or coordinator published to the
/// student's batches. Submit from inside the sheet; a reviewed submission is
/// frozen and shows the mentor's remarks.
class ActivitySpaceScreen extends ConsumerWidget {
  const ActivitySpaceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activitiesAsync = ref.watch(myActivitiesProvider);

    return AppScaffold(
      title: 'Activity Space',
      body: activitiesAsync.when(
        loading: () => const Center(child: LoadingState()),
        error: (e, _) => Center(
          child: ErrorRetry(
            message: 'Could not load activities',
            onRetry: () => ref.invalidate(myActivitiesProvider),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: EmptyState(
                icon: Icons.assignment_outlined,
                title: 'No activities yet',
                subtitle: 'Tasks from your mentor will appear here — you will also get a notification.',
              ),
            );
          }
          return RefreshIndicator(
            color: Brand.blue,
            backgroundColor: Brand.surface,
            onRefresh: () async => ref.invalidate(myActivitiesProvider),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, i) => _ActivityCard(
                item: items[i],
                onChanged: () => ref.invalidate(myActivitiesProvider),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ActivityCard extends StatelessWidget {
  final ActivityItem item;
  final VoidCallback onChanged;
  const _ActivityCard({required this.item, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final (chipColor, chipLabel, chipIcon) = item.reviewed
        ? (Brand.teal, 'Reviewed', Icons.check_circle)
        : item.submitted
            ? (Brand.blue, 'Submitted', Icons.task_alt)
            : item.overdue
                ? (Brand.red, 'Overdue', Icons.warning_amber_rounded)
                : (Brand.amber, 'To do', Icons.pending_actions);

    return GlassCard(
      onTap: () => _openSheet(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(item.title,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.bold)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: chipColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(chipIcon, size: 13, color: chipColor),
                  const SizedBox(width: 4),
                  Text(chipLabel,
                      style: TextStyle(color: chipColor, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(item.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white54, fontSize: 13, height: 1.4)),
          const SizedBox(height: 10),
          Text(
            [
              item.batchName,
              if (item.dueAt != null)
                'Due ${item.dueAt!.day}/${item.dueAt!.month}/${item.dueAt!.year}',
            ].join(' · '),
            style: const TextStyle(color: Colors.white30, fontSize: 11.5),
          ),
          if (item.reviewed && item.remarks != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Brand.teal.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('Mentor: ${item.remarks}',
                  style: const TextStyle(color: Brand.teal, fontSize: 12.5, height: 1.4)),
            ),
          ],
        ],
      ),
    );
  }

  void _openSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => _ActivitySheet(item: item, onChanged: onChanged),
    );
  }
}

class _ActivitySheet extends StatefulWidget {
  final ActivityItem item;
  final VoidCallback onChanged;
  const _ActivitySheet({required this.item, required this.onChanged});

  @override
  State<_ActivitySheet> createState() => _ActivitySheetState();
}

class _ActivitySheetState extends State<_ActivitySheet> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'Write your answer before submitting');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/activities/${widget.item.id}/submit',
        data: {'body': text},
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onChanged();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Submitted — your mentor will review it'),
        backgroundColor: Brand.surfaceAlt,
      ));
    } on DioException catch (e) {
      final code = (e.response?.data as Map<String, dynamic>?)?['error']?['code'];
      setState(() {
        _error = code == 'ALREADY_REVIEWED'
            ? 'This submission was already reviewed and cannot be changed.'
            : 'Could not submit. Check your connection and try again.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final editable = !item.reviewed;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 38, height: 4,
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              Text(item.title,
                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(item.description,
                  style: const TextStyle(color: Colors.white70, fontSize: 13.5, height: 1.5)),
              const SizedBox(height: 18),
              if (item.reviewed) ...[
                const Text('Mentor review',
                    style: TextStyle(color: Brand.teal, fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(item.remarks ?? '',
                    style: const TextStyle(color: Colors.white70, fontSize: 13.5, height: 1.45)),
              ] else ...[
                Text(item.submitted ? 'Update your submission' : 'Your submission',
                    style: const TextStyle(
                        color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                TextField(
                  controller: _ctrl,
                  maxLines: 6,
                  minLines: 4,
                  style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.45),
                  cursorColor: Brand.blue,
                  decoration: InputDecoration(
                    hintText: 'Type your answer here…',
                    hintStyle: const TextStyle(color: Colors.white24),
                    filled: true,
                    fillColor: Brand.surfaceAlt,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Brand.blue, width: 1.5),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(_error!, style: const TextStyle(color: Brand.red, fontSize: 12.5)),
                ],
                const SizedBox(height: 16),
                BrandButton(
                  label: item.submitted ? 'Update submission' : 'Submit',
                  loading: _busy,
                  onTap: editable && !_busy ? _submit : null,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
