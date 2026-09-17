import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/refresh/app_refresh.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../models/enroll_request.dart';
import '../providers/enroll_provider.dart';
import 'catalog_screen.dart' show rupees;

/// Waits for the server to say what the bank decided.
///
/// The student is on the bank's page in their browser; this screen is what
/// they come back to. It polls, and it re-checks the moment the app is
/// foregrounded, because that is the instant a returning student wants an
/// answer. When polling runs out it says the truth — the bank is still
/// confirming — and never invents an outcome from a browser redirect.
class PaymentPendingScreen extends ConsumerStatefulWidget {
  final CheckoutSession session;
  const PaymentPendingScreen({super.key, required this.session});

  @override
  ConsumerState<PaymentPendingScreen> createState() => _PaymentPendingScreenState();
}

class _PaymentPendingScreenState extends ConsumerState<PaymentPendingScreen>
    with WidgetsBindingObserver {
  static const _every = Duration(seconds: 3);
  static const _maxPolls = 40; // ~2 minutes of automatic checking

  Timer? _timer;
  int _polls = 0;
  bool _checking = false;
  bool _gaveUp = false;
  bool _awaitingPlacement = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(_every, (_) => _check());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back from the browser is the one moment worth checking at once.
    if (state == AppLifecycleState.resumed) _check(force: true);
  }

  Future<void> _check({bool force = false}) async {
    if (_checking) return;
    if (!force && _gaveUp) return;
    if (!force && _polls >= _maxPolls) {
      _timer?.cancel();
      if (mounted) setState(() => _gaveUp = true);
      return;
    }
    _checking = true;
    _polls++;
    try {
      final s = await EnrollApi.status(widget.session.orderId);
      if (!mounted) return;
      if (s.status == 'paid') {
        _timer?.cancel();
        // Access changed: the course list, batch and home stats all move.
        AppRefresh.forNotificationType(ref, 'admission_update');
        context.pushReplacement('/enrolled', extra: {
          'courseId': widget.session.courseId,
          'courseTitle': widget.session.courseTitle,
          'batchName': s.batchName ?? widget.session.batchName,
        });
      } else if (s.status == 'failed') {
        _timer?.cancel();
        setState(() => _failure = s.failureReason ?? 'The bank did not complete the payment.');
      } else if ((s.gatewayPaymentId ?? '').isNotEmpty) {
        // Paid, but the office has to place them by hand (batch full, etc.).
        _timer?.cancel();
        setState(() => _awaitingPlacement = true);
      }
    } catch (_) {
      // Transient; the next tick or the next resume tries again.
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    return PopScope(
      // Leaving is allowed — the course still opens when the bank confirms —
      // but say so, rather than letting a back-press look like cancelling.
      canPop: true,
      child: AppScaffold(
        title: 'Payment',
        body: Padding(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_failure != null)
                _state(
                  icon: Icons.error_outline_rounded, color: Brand.red,
                  title: 'Payment did not go through',
                  body: '$_failure\nNo money has been taken. You can try again.',
                  actions: [
                    BrandButton(label: 'Try again', onTap: () => context.pop()),
                    const SizedBox(height: 10),
                    TextButton(onPressed: () => context.go('/home'), child: const Text('Back to home')),
                  ],
                )
              else if (_awaitingPlacement)
                _state(
                  icon: Icons.verified_rounded, color: Brand.teal,
                  title: 'Payment received',
                  body: 'Your payment for ${s.courseTitle} is confirmed. Our office is placing you in a batch — you will get a notification the moment your classes open.',
                  actions: [BrandButton(label: 'Back to home', onTap: () => context.go('/home'))],
                )
              else if (_gaveUp)
                _state(
                  icon: Icons.schedule_rounded, color: Brand.amber,
                  title: 'The bank is still confirming',
                  body: 'This can take a few minutes. Your course opens automatically once it clears and we will notify you — you do not need to pay again.',
                  actions: [
                    BrandButton(
                      label: _checking ? 'Checking…' : 'Check again',
                      onTap: _checking ? null : () => _check(force: true),
                    ),
                    const SizedBox(height: 10),
                    TextButton(onPressed: () => context.go('/home'), child: const Text('Back to home')),
                  ],
                )
              else
                _state(
                  icon: null, color: Brand.blue,
                  title: 'Waiting for the bank',
                  body: "Finish paying ${rupees(s.amount)} on the bank's page, then come back here. We check automatically.",
                  actions: [
                    TextButton.icon(
                      onPressed: () => launchUrl(Uri.parse(s.paymentUrl), mode: LaunchMode.externalApplication),
                      icon: const Icon(Icons.open_in_new_rounded, size: 16),
                      label: const Text("Reopen the bank's page"),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _state({
    required IconData? icon, required Color color, required String title,
    required String body, required List<Widget> actions,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Center(
          child: icon == null
              ? const SizedBox(height: 56, width: 56, child: CircularProgressIndicator(strokeWidth: 3, color: Brand.blue))
              : Container(
                  height: 72, width: 72,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
                  child: Icon(icon, color: color, size: 38),
                ),
        ),
        const SizedBox(height: 24),
        Text(title, textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        Text(body, textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white60, fontSize: 14, height: 1.5)),
        const SizedBox(height: 28),
        ...actions,
      ],
    );
  }
}
