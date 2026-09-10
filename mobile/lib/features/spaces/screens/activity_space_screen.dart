import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
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

  final List<PendingAttachment> _attachments = [];
  bool _uploading = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _pickFile({required bool photo}) async {
    setState(() => _error = null);
    try {
      String? path;
      String name;
      if (photo) {
        final img = await ImagePicker().pickImage(
          source: ImageSource.gallery,
          imageQuality: 85,
          maxWidth: 2000,
        );
        if (img == null) return;
        path = img.path;
        name = img.name;
      } else {
        // file_picker 12 exposes this statically and returns a single file.
        final f = await FilePicker.pickFile(
          type: FileType.custom,
          allowedExtensions: const ['pdf'],
        );
        final picked = f?.path;
        if (picked == null) return;
        path = picked;
        name = f!.name;
      }

      setState(() => _uploading = true);
      final att = await uploadSubmissionFile(path, name);
      if (!mounted) return;
      setState(() {
        _attachments.add(att);
        _uploading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _error = e is DioException && e.response?.statusCode == 400
            ? ((e.response?.data as Map<String, dynamic>?)?['error']?['message'] as String? ??
                'That file could not be uploaded.')
            : 'Could not upload that file. Check your connection.';
      });
    }
  }

  Future<void> _submit() async {
    final text = _ctrl.text.trim();
    final item = widget.item;

    // Mirrors the server so a student is told before the round trip, not after.
    if (item.requiresFile && _attachments.isEmpty) {
      setState(() => _error = 'Attach a photo or PDF of your work before submitting');
      return;
    }
    if (!item.requiresFile && text.isEmpty && _attachments.isEmpty) {
      setState(() => _error = 'Write your answer or attach your work');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/activities/${widget.item.id}/submit',
        data: {
          if (text.isNotEmpty) 'body': text,
          if (_attachments.isNotEmpty)
            'attachments': _attachments.map((a) => a.toJson()).toList(),
        },
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
                    hintText: item.requiresFile
                        ? 'Add a note for your mentor (optional)…'
                        : 'Type your answer here…',
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
                if (item.requiresFile || item.allowsImage || item.allowsPdf) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Text(
                        item.requiresFile ? 'Attach your work (required)' : 'Attach your work',
                        style: const TextStyle(
                            color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      if (_uploading) ...[
                        const SizedBox(width: 10),
                        const SizedBox(
                          height: 13,
                          width: 13,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Brand.blue),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (item.allowsImage)
                        Expanded(
                          child: _AttachButton(
                            icon: Icons.photo_camera_back_outlined,
                            label: 'Photo',
                            onTap: _uploading || !editable ? null : () => _pickFile(photo: true),
                          ),
                        ),
                      if (item.allowsImage && item.allowsPdf) const SizedBox(width: 8),
                      if (item.allowsPdf)
                        Expanded(
                          child: _AttachButton(
                            icon: Icons.picture_as_pdf_outlined,
                            label: 'PDF',
                            onTap: _uploading || !editable ? null : () => _pickFile(photo: false),
                          ),
                        ),
                    ],
                  ),
                  if (_attachments.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _attachments.map((a) {
                        return Container(
                          padding: const EdgeInsets.fromLTRB(10, 7, 6, 7),
                          decoration: BoxDecoration(
                            color: Brand.surfaceAlt,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                a.kind == 'pdf' ? Icons.picture_as_pdf : Icons.image,
                                size: 15,
                                color: Brand.teal,
                              ),
                              const SizedBox(width: 6),
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 130),
                                child: Text(
                                  a.name,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.close, size: 15, color: Colors.white38),
                                visualDensity: VisualDensity.compact,
                                constraints: const BoxConstraints(),
                                padding: const EdgeInsets.only(left: 4),
                                onPressed: () => setState(() => _attachments.remove(a)),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
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

class _AttachButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  const _AttachButton({required this.icon, required this.label, this.onTap});

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Brand.surfaceAlt,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: disabled ? 0.04 : 0.1)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 17, color: disabled ? Colors.white24 : Brand.blue),
            const SizedBox(width: 8),
            Text(label,
                style: TextStyle(
                  color: disabled ? Colors.white24 : Colors.white70,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                )),
          ],
        ),
      ),
    );
  }
}
