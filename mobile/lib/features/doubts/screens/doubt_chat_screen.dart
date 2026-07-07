import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/doubt.dart';
import '../providers/doubts_provider.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

const _subjects = [
  'Polity',
  'History',
  'Geography',
  'Economy',
  'Science & Tech',
  'Environment',
  'Current Affairs',
  'Kerala GK',
  'Other',
];

class DoubtChatScreen extends ConsumerStatefulWidget {
  const DoubtChatScreen({super.key});

  @override
  ConsumerState<DoubtChatScreen> createState() => _DoubtChatScreenState();
}

class _DoubtChatScreenState extends ConsumerState<DoubtChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  String _subject = _subjects.first;
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.length < 3 || _sending) return;

    setState(() => _sending = true);
    _controller.clear();

    try {
      await ref.read(askDoubtProvider)(subject: _subject, body: text);
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF1E2445),
            content: Text(
              e.toString().contains('429')
                  ? 'Too many doubts this hour — try again later.'
                  : 'Could not send your doubt. Check your connection.',
              style: const TextStyle(color: Colors.white),
            ),
          ),
        );
        _controller.text = text; // restore so the student doesn't lose it
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final doubtsAsync = ref.watch(myDoubtsProvider);

    return AppScaffold(
      title: 'AI Doubt Solver',
      showBack: true,
      body: Column(
        children: [
          Expanded(
            child: doubtsAsync.when(
              loading: () => const LoadingState(),
              error: (e, _) => ErrorRetry(
                message: 'Could not load your doubts',
                onRetry: () => ref.invalidate(myDoubtsProvider),
              ),
              data: (doubts) {
                if (doubts.isEmpty) return const _EmptyState();
                // API returns newest first — chat reads oldest → newest
                final ordered = doubts.reversed.toList();
                _scrollToBottom();
                return ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  itemCount: ordered.length,
                  itemBuilder: (context, i) => _DoubtThread(doubt: ordered[i]),
                );
              },
            ),
          ),
          if (_sending) const _ThinkingIndicator(),
          _Composer(
            controller: _controller,
            subject: _subject,
            sending: _sending,
            onSubjectChanged: (s) => setState(() => _subject = s),
            onSend: _send,
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Brand.blue, Color(0xFF4FDBC8)],
                ),
              ),
              child: const Icon(Icons.psychology_alt, color: Colors.white, size: 40),
            ),
            const SizedBox(height: 20),
            const Text('Ask your first doubt',
                style: TextStyle(
                    color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text(
              'Stuck on Polity, History, Economy or anything else?\nOur AI tutor answers instantly — tough ones go to a mentor.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white54, fontSize: 13, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _DoubtThread extends StatelessWidget {
  final Doubt doubt;
  const _DoubtThread({required this.doubt});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Student question bubble (right)
        Align(
          alignment: Alignment.centerRight,
          child: Container(
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.78),
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Brand.blue,
              borderRadius: BorderRadius.circular(16).copyWith(
                bottomRight: const Radius.circular(4),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(doubt.subject.toUpperCase(),
                    style: const TextStyle(
                        color: Color(0xFFD3BBFF),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5)),
                const SizedBox(height: 4),
                Text(doubt.body,
                    style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.4)),
              ],
            ),
          ),
        ),
        // Answer bubble (left)
        Align(
          alignment: Alignment.centerLeft,
          child: Container(
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.82),
            margin: const EdgeInsets.only(bottom: 20),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1F3A),
              borderRadius: BorderRadius.circular(16).copyWith(
                bottomLeft: const Radius.circular(4),
              ),
              border: Border.all(color: const Color(0xFF2A3050)),
            ),
            child: _answerContent(),
          ),
        ),
      ],
    );
  }

  Widget _answerContent() {
    if (doubt.humanAnswer != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _AnswerTag(
              icon: Icons.school, label: 'MENTOR', color: Color(0xFFFFB95F)),
          const SizedBox(height: 6),
          Text(doubt.humanAnswer!,
              style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.5)),
        ],
      );
    }
    if (doubt.aiAnswer != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const _AnswerTag(
                  icon: Icons.auto_awesome, label: 'AI TUTOR', color: Color(0xFF4FDBC8)),
              const Spacer(),
              if (doubt.aiConfidence != null)
                Text('${(doubt.aiConfidence! * 100).round()}% confident',
                    style: const TextStyle(color: Colors.white38, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 6),
          Text(doubt.aiAnswer!,
              style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.5)),
          if (doubt.isEscalated) ...[
            const SizedBox(height: 8),
            const _EscalatedNote(),
          ],
        ],
      );
    }
    return const _EscalatedNote();
  }
}

class _AnswerTag extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _AnswerTag({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 14),
        const SizedBox(width: 4),
        Text(label,
            style: TextStyle(
                color: color, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
      ],
    );
  }
}

class _EscalatedNote extends StatelessWidget {
  const _EscalatedNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFFFB95F).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.support_agent, color: Color(0xFFFFB95F), size: 16),
          SizedBox(width: 6),
          Flexible(
            child: Text('Sent to a mentor — you\'ll get a notification when they reply.',
                style: TextStyle(color: Color(0xFFFFB95F), fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _ThinkingIndicator extends StatelessWidget {
  const _ThinkingIndicator();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      alignment: Alignment.centerLeft,
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF4FDBC8)),
          ),
          SizedBox(width: 10),
          Text('AI tutor is thinking…',
              style: TextStyle(color: Colors.white54, fontSize: 13)),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final String subject;
  final bool sending;
  final ValueChanged<String> onSubjectChanged;
  final VoidCallback onSend;

  const _Composer({
    required this.controller,
    required this.subject,
    required this.sending,
    required this.onSubjectChanged,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
          12, 8, 12, 8 + MediaQuery.of(context).padding.bottom),
      decoration: const BoxDecoration(
        color: Color(0xFF181B2A),
        border: Border(top: BorderSide(color: Color(0xFF2A3050))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _subjects.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (context, i) {
                final s = _subjects[i];
                final active = s == subject;
                return ChoiceChip(
                  label: Text(s, style: const TextStyle(fontSize: 12)),
                  selected: active,
                  onSelected: (_) => onSubjectChanged(s),
                  selectedColor: Brand.blue,
                  backgroundColor: const Color(0xFF1E2445),
                  labelStyle:
                      TextStyle(color: active ? Colors.white : Colors.white60),
                  side: BorderSide.none,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  visualDensity: VisualDensity.compact,
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: !sending,
                  maxLength: 2000,
                  maxLines: 4,
                  minLines: 1,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  decoration: InputDecoration(
                    counterText: '',
                    hintText: 'Type your doubt…',
                    hintStyle: const TextStyle(color: Colors.white38),
                    filled: true,
                    fillColor: const Color(0xFF1E2445),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  onSubmitted: (_) => onSend(),
                ),
              ),
              const SizedBox(width: 8),
              Material(
                color: sending ? const Color(0xFF2A3050) : Brand.blue,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: sending ? null : onSend,
                  child: const Padding(
                    padding: EdgeInsets.all(12),
                    child: Icon(Icons.send_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
