import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../models/exam.dart';
import '../providers/exams_provider.dart';

/// Interactive exam player. When [examId] is a real backend id it starts an
/// attempt, loads server questions and submits for server-side scoring.
/// Otherwise (Demo Mode / no id) it uses sample questions with local scoring.
class ExamPlayerScreen extends StatefulWidget {
  final String? examId;
  final String title;
  final int durationMins;
  const ExamPlayerScreen({super.key, this.examId, this.title = 'Mock Test', this.durationMins = 20});

  @override
  State<ExamPlayerScreen> createState() => _ExamPlayerScreenState();
}

class _ExamPlayerScreenState extends State<ExamPlayerScreen> {
  static const _sample = [
    ExamQuestionApi(id: 'q1', subject: 'Indian Polity', marks: 2.0, correct: 2,
        body: 'Which article of the Indian Constitution provides for the Right to Constitutional Remedies?',
        options: ['Article 14', 'Article 19', 'Article 32', 'Article 44']),
    ExamQuestionApi(id: 'q2', subject: 'Indian Polity', marks: 2.0, correct: 0,
        body: 'The Preamble of the Indian Constitution was first amended by which amendment?',
        options: ['42nd Amendment', '44th Amendment', '1st Amendment', '73rd Amendment']),
    ExamQuestionApi(id: 'q3', subject: 'History', marks: 2.0, correct: 1,
        body: 'Who is known as the "Father of the Indian Constitution"?',
        options: ['Mahatma Gandhi', 'Dr. B.R. Ambedkar', 'Jawaharlal Nehru', 'Sardar Patel']),
    ExamQuestionApi(id: 'q4', subject: 'Geography', marks: 2.0, correct: 2,
        body: 'The Tropic of Cancer passes through how many Indian states?',
        options: ['6', '7', '8', '9']),
    ExamQuestionApi(id: 'q5', subject: 'Indian Polity', marks: 2.0, correct: 2,
        body: 'Which body is responsible for the conduct of elections in India?',
        options: ['Parliament', 'Supreme Court', 'Election Commission', 'NITI Aayog']),
  ];

  List<ExamQuestionApi> _questions = const [];
  String? _attemptId; // set when a real attempt was started
  bool _loading = true;
  String? _loadError;

  int _current = 0;
  final Map<int, int> _answers = {};
  final Set<int> _review = {};
  late int _remaining;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _remaining = widget.durationMins * 60;
    _load();
  }

  Future<void> _load() async {
    // Real exam → start an attempt and use server questions.
    if (widget.examId != null) {
      try {
        final started = await ExamRepository.start(widget.examId!);
        setState(() {
          _questions = started.questions;
          _attemptId = started.attemptId;
          _loading = false;
        });
        _startTimer();
        return;
      } catch (_) {
        // fall through to sample questions
      }
    }
    setState(() {
      _questions = _sample;
      _loading = false;
    });
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_remaining <= 0) {
        t.cancel();
        _submit();
      } else {
        setState(() => _remaining--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _time {
    final m = (_remaining ~/ 60).toString().padLeft(2, '0');
    final s = (_remaining % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _submit() async {
    _timer?.cancel();
    ExamResult result;

    if (_attemptId != null && widget.examId != null) {
      // Server-side scoring
      final answersById = <String, int>{};
      _answers.forEach((qi, opt) => answersById[_questions[qi].id] = opt);
      try {
        result = await ExamRepository.submit(widget.examId!, _attemptId!, answersById, _questions.length);
      } catch (_) {
        result = _localScore();
      }
    } else {
      result = _localScore();
    }

    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => _ResultScreen(result: result)));
  }

  ExamResult _localScore() {
    int correct = 0;
    _answers.forEach((q, a) {
      if (_questions[q].correct == a) correct++;
    });
    return ExamResult(
        total: _questions.length, correct: correct, attempted: _answers.length, score: correct * 2.0);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(backgroundColor: Brand.bg, body: LoadingState(message: 'Loading questions…'));
    }
    if (_questions.isEmpty) {
      return Scaffold(
        backgroundColor: Brand.bg,
        body: ErrorRetry(message: _loadError ?? 'No questions available', onRetry: () => Navigator.pop(context)),
      );
    }

    final q = _questions[_current];
    final selected = _answers[_current];

    return Scaffold(
      backgroundColor: Brand.bg,
      body: SafeArea(
        child: Column(
          children: [
            _topBar(),
            LinearProgressIndicator(
              value: (_current + 1) / _questions.length,
              minHeight: 4,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              valueColor: const AlwaysStoppedAnimation(Brand.teal),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Brand.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: const Border(left: BorderSide(color: Brand.blue, width: 3)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Question ${_current + 1}',
                            style: const TextStyle(color: Brand.blue, fontSize: 15, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 10),
                        Text(q.body,
                            style: const TextStyle(color: Colors.white, fontSize: 17, height: 1.5, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            _tag(q.subject, Brand.surface2, Colors.white70),
                            const SizedBox(width: 8),
                            _tag('+${q.marks.toStringAsFixed(1)} Marks', Brand.surface2, Brand.teal),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  ...List.generate(q.options.length, (i) => _option(i, q.options[i], selected == i)),
                ],
              ),
            ),
            _bottomBar(),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    final low = _remaining < 60;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      child: Row(
        children: [
          Text.rich(TextSpan(children: [
            TextSpan(text: 'Q ${_current + 1}',
                style: const TextStyle(color: Brand.blue, fontSize: 20, fontWeight: FontWeight.bold)),
            TextSpan(text: ' / ${_questions.length}', style: const TextStyle(color: Colors.white38, fontSize: 15)),
          ])),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: (low ? Brand.red : Brand.amber).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: (low ? Brand.red : Brand.amber).withValues(alpha: 0.5)),
            ),
            child: Row(children: [
              Icon(Icons.timer_outlined, color: low ? Brand.red : Brand.amber, size: 15),
              const SizedBox(width: 5),
              Text(_time, style: TextStyle(color: low ? Brand.red : Brand.amber, fontSize: 14, fontWeight: FontWeight.bold)),
            ]),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: () => setState(() => _review.contains(_current) ? _review.remove(_current) : _review.add(_current)),
            icon: Icon(Icons.flag, color: _review.contains(_current) ? Brand.amber : Colors.white38, size: 20),
          ),
        ],
      ),
    );
  }

  Widget _option(int i, String text, bool selected) {
    final letter = String.fromCharCode(65 + i);
    return GestureDetector(
      onTap: () => setState(() => _answers[_current] = i),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? Brand.blue.withValues(alpha: 0.12) : Brand.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? Brand.blue : Colors.white.withValues(alpha: 0.08), width: selected ? 1.6 : 1),
        ),
        child: Row(
          children: [
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(color: selected ? Brand.blue : Brand.surface2, borderRadius: BorderRadius.circular(9)),
              alignment: Alignment.center,
              child: Text(letter, style: TextStyle(color: selected ? Colors.white : Colors.white54, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(text, style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: selected ? FontWeight.w600 : FontWeight.normal))),
            if (selected) const Icon(Icons.check_circle, color: Brand.blue, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar() {
    final isLast = _current == _questions.length - 1;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: Brand.surface,
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.06))),
      ),
      child: Row(
        children: [
          OutlinedButton.icon(
            onPressed: _current > 0 ? () => setState(() => _current--) : null,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white70,
              side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.arrow_back, size: 16),
            label: const Text('Prev'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ElevatedButton(
              onPressed: () => isLast ? _confirmSubmit() : setState(() => _current++),
              style: ElevatedButton.styleFrom(
                backgroundColor: isLast ? Brand.teal : Brand.blue,
                foregroundColor: isLast ? const Color(0xFF00201C) : Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
              child: Text(isLast ? 'Submit Test' : 'Next'),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmSubmit() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Brand.surface2,
        title: const Text('Submit test?', style: TextStyle(color: Colors.white)),
        content: Text('You have answered ${_answers.length} of ${_questions.length} questions.',
            style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _submit();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Brand.teal, foregroundColor: const Color(0xFF00201C)),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  Widget _tag(String text, Color bg, Color fg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

class _ResultScreen extends StatelessWidget {
  final ExamResult result;
  const _ResultScreen({required this.result});

  @override
  Widget build(BuildContext context) {
    final pct = result.total == 0 ? 0.0 : result.correct / result.total;
    final passed = pct >= 0.5;

    return Scaffold(
      backgroundColor: Brand.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              SizedBox(
                width: 140, height: 140,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 140, height: 140,
                      child: CircularProgressIndicator(
                        value: pct,
                        strokeWidth: 10,
                        backgroundColor: Colors.white.withValues(alpha: 0.08),
                        valueColor: AlwaysStoppedAnimation(passed ? Brand.teal : Brand.amber),
                      ),
                    ),
                    Text('${(pct * 100).round()}%',
                        style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Text(passed ? 'Well done! 🎉' : 'Keep practising 💪',
                  style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('You scored ${result.score.toStringAsFixed(1)} marks',
                  style: const TextStyle(color: Colors.white54, fontSize: 15)),
              const SizedBox(height: 28),
              Row(
                children: [
                  Expanded(child: _stat('${result.correct}', 'Correct', Brand.teal)),
                  const SizedBox(width: 12),
                  Expanded(child: _stat('${result.attempted - result.correct}', 'Wrong', Brand.red)),
                  const SizedBox(width: 12),
                  Expanded(child: _stat('${result.total - result.attempted}', 'Skipped', Colors.white54)),
                ],
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Brand.blue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                  child: const Text('Back to Exams'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(String value, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 12)),
        ],
      ),
    );
  }
}
