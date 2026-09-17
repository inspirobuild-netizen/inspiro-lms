import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../courses/models/course.dart';
import '../../courses/providers/courses_provider.dart';
import '../models/enroll_request.dart';
import '../providers/enroll_provider.dart';
import 'catalog_screen.dart' show rupees;

/// Enrol by paying in the app.
///
/// One screen, one decision: here is the fee, here is the batch you will
/// join, pay. The bank's page opens outside the app; when the student comes
/// back, the pending screen asks the server what happened. Nothing here
/// decides an outcome, and there is no reference number to type — the
/// office-verified QR flow this replaced is gone.
class EnrollScreen extends ConsumerStatefulWidget {
  final Course course;
  const EnrollScreen({super.key, required this.course});

  @override
  ConsumerState<EnrollScreen> createState() => _EnrollScreenState();
}

class _EnrollScreenState extends ConsumerState<EnrollScreen> {
  String? _planId;
  int _installmentIndex = 0;
  bool _busy = false;
  String? _error;

  Future<void> _pay(EnrolOptions o) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await EnrollApi.checkout(
        courseId: o.courseId,
        feePlanId: _planId,
        installmentIndex: _installmentIndex,
      );
      final uri = Uri.parse(session.paymentUrl);
      // External browser, not a webview: banks fingerprint the browser, block
      // embedded views, and a student's saved cards live in their own browser.
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened) throw const _Unopenable();
      if (!mounted) return;
      context.pushReplacement('/pay-pending', extra: session);
    } on DioException catch (e) {
      final err = e.response?.data is Map ? (e.response!.data as Map)['error'] : null;
      final msg = err is Map ? err['message'] as String? : null;
      setState(() => _error = msg ?? 'Could not start the payment. Please try again.');
    } on _Unopenable {
      setState(() => _error = 'Could not open the bank page. Check that a browser is installed and try again.');
    } catch (_) {
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Staff can enrol a student from the admin panel, so a student can arrive
    // here already having access. Never show them a pay button.
    final alreadyEnrolled = ref.watch(coursesProvider).asData?.value.any((c) => c.id == widget.course.id) ?? false;
    if (alreadyEnrolled) {
      return AppScaffold(title: widget.course.title, body: _panel(
        icon: Icons.check_circle, color: Brand.teal,
        title: 'You are already enrolled',
        body: 'Nothing more to pay for ${widget.course.title}.',
        action: BrandButton(label: 'Open the course', onTap: () => context.pushReplacement('/course', extra: widget.course.id)),
      ));
    }

    final awaitingApproval = ref.watch(myPendingAccessProvider).asData?.value.contains(widget.course.id) ?? false;
    if (awaitingApproval) {
      return AppScaffold(title: widget.course.title, body: _panel(
        icon: Icons.hourglass_top_rounded, color: Brand.amber,
        title: 'Admission received',
        body: 'Your admission has been recorded. Course access opens once our office confirms the payment — usually within a working day. Nothing more to pay here.',
      ));
    }

    final optionsAsync = ref.watch(enrolOptionsProvider(widget.course.id));
    return AppScaffold(
      title: 'Enrol',
      body: optionsAsync.when(
        loading: () => const LoadingState(),
        error: (_, __) => ErrorRetry(
          message: 'Could not load enrolment details',
          onRetry: () => ref.invalidate(enrolOptionsProvider(widget.course.id)),
        ),
        data: (o) => o.alreadyEnrolled
            ? _panel(
                icon: Icons.check_circle, color: Brand.teal,
                title: 'You are already enrolled',
                body: 'Nothing more to pay for ${o.courseTitle}.',
                action: BrandButton(label: 'Open the course', onTap: () => context.pushReplacement('/course', extra: o.courseId)),
              )
            : _checkout(o),
      ),
    );
  }

  Widget _checkout(EnrolOptions o) {
    final plan = o.plans.where((p) => p.id == _planId).firstOrNull;
    final amount = plan == null
        ? o.feeAmount
        : (plan.installments.isEmpty ? plan.totalAmount : plan.installments[_installmentIndex].amount);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        // ── What they are buying ──
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(o.courseTitle,
                  style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.bold, height: 1.25)),
              if (o.batch != null) ...[
                const SizedBox(height: 10),
                Row(children: [
                  const Icon(Icons.groups_rounded, color: Brand.teal, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      "You'll join ${o.batch!.name}${o.batch!.startDate != null ? ' · starts ${_date(o.batch!.startDate!)}' : ''}",
                      style: const TextStyle(color: Colors.white70, fontSize: 13.5),
                    ),
                  ),
                ]),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── Price ──
        if (o.plans.isNotEmpty) ...[
          const SectionHeader(title: 'Choose a fee plan'),
          const SizedBox(height: 8),
          _PlanTile(
            title: 'Full course fee',
            subtitle: 'Pay once',
            amount: o.feeAmount,
            selected: _planId == null,
            onTap: () => setState(() { _planId = null; _installmentIndex = 0; }),
          ),
          for (final p in o.plans)
            _PlanTile(
              title: p.name,
              subtitle: p.installments.isEmpty
                  ? 'Total ${rupees(p.totalAmount)}'
                  : '${p.installments.length} installments · total ${rupees(p.totalAmount)}',
              amount: p.installments.isEmpty ? p.totalAmount : p.installments.first.amount,
              amountLabel: p.installments.isEmpty ? null : 'now',
              selected: _planId == p.id,
              onTap: () => setState(() { _planId = p.id; _installmentIndex = 0; }),
            ),
          const SizedBox(height: 16),
        ],

        GlassCard(
          child: Column(
            children: [
              _row('Course fee', rupees(o.feeAmount)),
              if (plan != null && plan.installments.isNotEmpty) ...[
                const SizedBox(height: 8),
                _row('Paying now', '${plan.installments[_installmentIndex].label} · ${rupees(amount)}'),
              ],
              const Divider(color: Colors.white12, height: 22),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total to pay', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
                  Text(rupees(amount), style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),

        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Brand.red.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Brand.red.withValues(alpha: 0.4)),
            ),
            child: Text(_error!, style: const TextStyle(color: Brand.red, fontSize: 13)),
          ),
          const SizedBox(height: 12),
        ],

        if (o.canPayOnline) ...[
          BrandButton(
            label: _busy ? 'Opening the bank…' : 'Pay ${rupees(amount)} securely',
            onTap: _busy ? null : () => _pay(o),
          ),
          const SizedBox(height: 10),
          const Text(
            "You'll be taken to the bank's secure page. Come back to the app once you're done — your course opens the moment the payment clears.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white38, fontSize: 12, height: 1.45),
          ),
        ] else
          _panel(
            icon: Icons.storefront_rounded, color: Brand.amber,
            title: 'Pay at the office',
            body: o.unavailableReason ?? 'Online payment is not available right now.',
            flat: true,
          ),
      ],
    );
  }

  Widget _row(String k, String v) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: const TextStyle(color: Colors.white54, fontSize: 13.5)),
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w600)),
        ],
      );

  Widget _panel({
    required IconData icon, required Color color, required String title, required String body,
    Widget? action, bool flat = false,
  }) {
    final card = Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(body, style: const TextStyle(color: Colors.white60, fontSize: 13, height: 1.45)),
              ],
            ),
          ),
        ],
      ),
    );
    if (flat) return card;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 28),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        card,
        if (action != null) ...[const SizedBox(height: 22), action],
      ]),
    );
  }

  static String _date(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

class _Unopenable implements Exception {
  const _Unopenable();
}

class _PlanTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final double amount;
  final String? amountLabel;
  final bool selected;
  final VoidCallback onTap;
  const _PlanTile({
    required this.title, required this.subtitle, required this.amount,
    required this.selected, required this.onTap, this.amountLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? Brand.blue.withValues(alpha: 0.14) : Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? Brand.blue : Colors.white12),
          ),
          child: Row(
            children: [
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off,
                  color: selected ? Brand.blue : Colors.white38, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 12)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(rupees(amount), style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                  if (amountLabel != null)
                    Text(amountLabel!, style: const TextStyle(color: Colors.white38, fontSize: 11)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
