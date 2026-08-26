import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../providers/spaces_provider.dart';

/// Feedback space: the student's direct line to the academic coordinator.
/// Category + optional stars + message; previous feedback listed below so it
/// never feels like shouting into a void.
class FeedbackSpaceScreen extends ConsumerStatefulWidget {
  const FeedbackSpaceScreen({super.key});

  @override
  ConsumerState<FeedbackSpaceScreen> createState() => _FeedbackSpaceScreenState();
}

class _FeedbackSpaceScreenState extends ConsumerState<FeedbackSpaceScreen> {
  static const _categories = [
    ('teaching', 'Teaching', Icons.school_outlined),
    ('content', 'Content', Icons.menu_book_outlined),
    ('app', 'App', Icons.smartphone_outlined),
    ('other', 'Other', Icons.chat_bubble_outline),
  ];

  String _category = 'teaching';
  int _rating = 0;
  final _msgCtrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _msgCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final msg = _msgCtrl.text.trim();
    if (msg.length < 2) {
      setState(() => _error = 'Write a few words of feedback first');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/feedback',
        data: {
          'category': _category,
          if (_rating > 0) 'rating': _rating,
          'message': msg,
        },
      );
      if (!mounted) return;
      _msgCtrl.clear();
      setState(() {
        _rating = 0;
        _busy = false;
      });
      ref.invalidate(myFeedbackProvider);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Thank you — your feedback has reached the academy'),
        backgroundColor: Brand.surfaceAlt,
      ));
    } on DioException {
      setState(() {
        _error = 'Could not send. Check your connection and try again.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mineAsync = ref.watch(myFeedbackProvider);

    return AppScaffold(
      title: 'Feedback Space',
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Tell us what to improve',
                      style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  const Text('Goes straight to your academic coordinator.',
                      style: TextStyle(color: Colors.white38, fontSize: 12.5)),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _categories.map((c) {
                      final selected = _category == c.$1;
                      return GestureDetector(
                        onTap: () => setState(() => _category = c.$1),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected ? Brand.blue.withValues(alpha: 0.16) : Brand.surfaceAlt,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                                color: selected ? Brand.blue : Colors.white.withValues(alpha: 0.08)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(c.$3, size: 15, color: selected ? Brand.blue : Colors.white38),
                            const SizedBox(width: 6),
                            Text(c.$2,
                                style: TextStyle(
                                    color: selected ? Brand.blue : Colors.white54,
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600)),
                          ]),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Text('Rating',
                          style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 10),
                      ...List.generate(5, (i) {
                        final filled = i < _rating;
                        return GestureDetector(
                          // Tapping the current star again clears the rating —
                          // stars are optional.
                          onTap: () => setState(() => _rating = (_rating == i + 1) ? 0 : i + 1),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: Icon(
                              filled ? Icons.star_rounded : Icons.star_outline_rounded,
                              color: filled ? Brand.amber : Colors.white24,
                              size: 26,
                            ),
                          ),
                        );
                      }),
                      if (_rating > 0)
                        Padding(
                          padding: const EdgeInsets.only(left: 6),
                          child: Text('$_rating/5',
                              style: const TextStyle(color: Colors.white38, fontSize: 12)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _msgCtrl,
                    maxLines: 5,
                    minLines: 3,
                    style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.45),
                    cursorColor: Brand.blue,
                    decoration: InputDecoration(
                      hintText: 'What is working well? What should change?',
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
                  BrandButton(label: 'Send feedback', loading: _busy, onTap: _busy ? null : _send),
                ],
              ),
            ),
            const SizedBox(height: 24),
            mineAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (mine) {
                if (mine.isEmpty) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Your previous feedback',
                        style: TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    ...mine.map((f) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: GlassCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(f.category.toUpperCase(),
                                        style: const TextStyle(
                                            color: Brand.blue, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                                    const Spacer(),
                                    if (f.rating != null)
                                      Text('★' * f.rating!,
                                          style: const TextStyle(color: Brand.amber, fontSize: 12)),
                                    const SizedBox(width: 8),
                                    Text('${f.createdAt.day}/${f.createdAt.month}/${f.createdAt.year}',
                                        style: const TextStyle(color: Colors.white30, fontSize: 11)),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(f.message,
                                    style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.4)),
                              ],
                            ),
                          ),
                        )),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
