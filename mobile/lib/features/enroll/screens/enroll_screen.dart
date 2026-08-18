import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../courses/models/course.dart';
import '../../courses/providers/courses_provider.dart';
import '../models/enroll_request.dart';
import '../providers/enroll_provider.dart';
import 'catalog_screen.dart' show rupees;

enum _Step { pickPlan, pay, submitted }

/// Three-step self-enrolment: pick a preset plan → scan the server-built UPI
/// QR → submit the reference. Deliberately never lets the student type an
/// amount; the figure always comes from a plan installment or the course fee.
class EnrollScreen extends ConsumerStatefulWidget {
  final Course course;
  const EnrollScreen({super.key, required this.course});

  @override
  ConsumerState<EnrollScreen> createState() => _EnrollScreenState();
}

class _EnrollScreenState extends ConsumerState<EnrollScreen> {
  _Step _step = _Step.pickPlan;
  String? _planId;
  int _installmentIndex = 0;
  EnrollSession? _session;
  final _refCtrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _refCtrl.dispose();
    super.dispose();
  }

  Future<void> _startPayment() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await EnrollApi.start(
        courseId: widget.course.id,
        feePlanId: _planId,
        installmentIndex: _installmentIndex,
      );
      setState(() {
        _session = session;
        _step = _Step.pay;
        _busy = false;
      });
    } on DioException catch (e) {
      setState(() {
        _error = e.message ?? 'Could not start the payment. Please try again.';
        _busy = false;
      });
    }
  }

  Future<void> _submitReference() async {
    final ref0 = _refCtrl.text.trim();
    if (ref0.length < 3) {
      setState(() => _error = 'Enter the UPI reference / UTR number from your payment app');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await EnrollApi.submitReference(requestId: _session!.request.id, reference: ref0);
      ref.invalidate(myEnrollRequestsProvider);
      setState(() {
        _step = _Step.submitted;
        _busy = false;
      });
    } on DioException catch (e) {
      setState(() {
        _error = e.message ?? 'Could not submit your reference. Please try again.';
        _busy = false;
      });
    }
  }

  Widget _buildAlreadyEnrolled() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Brand.teal.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Brand.teal.withValues(alpha: 0.35)),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle, color: Brand.teal, size: 26),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('You are already enrolled',
                          style: TextStyle(
                              color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text('Nothing more to pay for ${widget.course.title}.',
                          style: const TextStyle(color: Colors.white60, fontSize: 13, height: 1.4)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          BrandButton(
            label: 'Open the course',
            onTap: () => context.pushReplacement('/course', extra: widget.course.id),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Staff can enrol a student straight from the admin panel, which is a
    // different path from this one — so a student can arrive here already
    // having access. Without this the flow ran all the way to the payment
    // screen before the API refused with ALREADY_ENROLLED, which reads as
    // being asked to pay twice for a course they already own.
    final alreadyEnrolled = ref
            .watch(coursesProvider)
            .asData
            ?.value
            .any((c) => c.id == widget.course.id) ??
        false;

    if (alreadyEnrolled) {
      return AppScaffold(
        title: widget.course.title,
        body: _buildAlreadyEnrolled(),
      );
    }

    return AppScaffold(
      title: switch (_step) {
        _Step.pickPlan => 'Choose a plan',
        _Step.pay => 'Pay by UPI',
        _Step.submitted => 'Almost there',
      },
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: switch (_step) {
          _Step.pickPlan => _buildPickPlan(),
          _Step.pay => _buildPay(),
          _Step.submitted => _buildSubmitted(),
        },
      ),
    );
  }

  // ── Step 1: preset plan picker ─────────────────────────────────────────────
  Widget _buildPickPlan() {
    final plansAsync = ref.watch(courseFeePlansProvider(widget.course.id));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(widget.course.title,
                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text(widget.course.subject,
                  style: const TextStyle(color: Colors.white38, fontSize: 12.5)),
            ],
          ),
        ),
        const SizedBox(height: 22),
        plansAsync.when(
          loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 30), child: LoadingState()),
          error: (e, _) => ErrorRetry(
            message: 'Could not load payment plans',
            onRetry: () => ref.invalidate(courseFeePlansProvider(widget.course.id)),
          ),
          data: (plans) {
            if (plans.isEmpty) {
              // No preset plans — the whole course fee is the only option.
              if (widget.course.feeAmount <= 0) {
                return const EmptyState(
                  icon: Icons.info_outline,
                  title: 'Enrolment not open yet',
                  subtitle: 'This course has no payment plan configured. Please contact the academy.',
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionHeader(title: 'Amount payable'),
                  _AmountRow(label: 'Full course fee', amount: widget.course.feeAmount, selected: true),
                  const SizedBox(height: 22),
                  if (_error != null) _errorBox(),
                  BrandButton(label: 'Continue to payment', loading: _busy, onTap: _startPayment),
                ],
              );
            }

            final selected = _planId ?? plans.first.id;
            final selectedPlan = plans.firstWhere((p) => p.id == selected, orElse: () => plans.first);
            final installments = selectedPlan.installments;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionHeader(title: 'Choose a payment plan'),
                ...plans.map((p) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _PlanTile(
                        plan: p,
                        selected: p.id == selected,
                        onTap: () => setState(() {
                          _planId = p.id;
                          _installmentIndex = 0;
                        }),
                      ),
                    )),
                if (installments.length > 1) ...[
                  const SizedBox(height: 14),
                  const SectionHeader(title: 'Pay now'),
                  ...List.generate(installments.length, (i) {
                    final inst = installments[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _AmountRow(
                        label: inst.label,
                        amount: inst.amount,
                        selected: i == _installmentIndex,
                        onTap: () => setState(() => _installmentIndex = i),
                      ),
                    );
                  }),
                ] else if (installments.length == 1) ...[
                  const SizedBox(height: 14),
                  const SectionHeader(title: 'Pay now'),
                  _AmountRow(label: installments.first.label, amount: installments.first.amount, selected: true),
                ],
                const SizedBox(height: 22),
                if (_error != null) _errorBox(),
                BrandButton(label: 'Continue to payment', loading: _busy, onTap: _startPayment),
              ],
            );
          },
        ),
      ],
    );
  }

  // ── Step 2: QR + reference entry ───────────────────────────────────────────
  Widget _buildPay() {
    final qr = _session!.qr;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Column(
            children: [
              Text(rupees(qr.amount),
                  style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text('to ${qr.payeeName}',
                  style: const TextStyle(color: Colors.white38, fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
            ),
            child: QrImageView(
              data: qr.upiUri,
              version: QrVersions.auto,
              size: 220,
              backgroundColor: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 14),
        Center(
          child: Text('${qr.vpa}  ·  Ref ${qr.reference}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white38, fontSize: 11.5)),
        ),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Brand.amber.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Brand.amber.withValues(alpha: 0.25)),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, color: Brand.amber, size: 18),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Scan with any UPI app (GPay, PhonePe, Paytm), pay, then enter the reference / UTR number below. Our team verifies it before your course unlocks.',
                  style: TextStyle(color: Color(0xFFFFD68A), fontSize: 12.5, height: 1.45),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        const Text('UPI reference / UTR number',
            style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(height: 10),
        TextField(
          controller: _refCtrl,
          textCapitalization: TextCapitalization.characters,
          style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: 0.5),
          cursorColor: Brand.blue,
          decoration: InputDecoration(
            hintText: 'e.g. 412345678901',
            hintStyle: const TextStyle(color: Colors.white24),
            filled: true,
            fillColor: Brand.surfaceAlt,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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
          onSubmitted: (_) => _submitReference(),
        ),
        if (_error != null) _errorBox(),
        const SizedBox(height: 20),
        BrandButton(label: "I've paid — submit", loading: _busy, onTap: _submitReference),
        const SizedBox(height: 10),
        Center(
          child: TextButton(
            onPressed: _busy ? null : () => setState(() => _step = _Step.pickPlan),
            child: const Text('Back to plans', style: TextStyle(color: Colors.white38, fontSize: 13)),
          ),
        ),
      ],
    );
  }

  // ── Step 3: submitted, pending staff verification ──────────────────────────
  Widget _buildSubmitted() {
    return Padding(
      padding: const EdgeInsets.only(top: 40),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Brand.teal.withValues(alpha: 0.14),
            ),
            child: const Icon(Icons.check_rounded, color: Brand.teal, size: 40),
          ),
          const SizedBox(height: 22),
          const Text('Payment submitted',
              style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              "Our team will verify your payment and activate your course shortly. You'll get a notification the moment it's confirmed.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white38, fontSize: 13.5, height: 1.55),
            ),
          ),
          const SizedBox(height: 30),
          BrandButton(label: 'Back to home', onTap: () => context.go('/home')),
        ],
      ),
    );
  }

  Widget _errorBox() => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: Brand.red.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Brand.red.withValues(alpha: 0.3)),
          ),
          child: Row(children: [
            const Icon(Icons.error_outline, color: Brand.red, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(_error!, style: const TextStyle(color: Color(0xFFFF8A9B), fontSize: 12.5, height: 1.35))),
          ]),
        ),
      );
}

class _PlanTile extends StatelessWidget {
  final FeePlanOption plan;
  final bool selected;
  final VoidCallback onTap;

  const _PlanTile({required this.plan, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? Brand.blue.withValues(alpha: 0.12) : Brand.surface.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? Brand.blue : Colors.white.withValues(alpha: 0.08),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                color: selected ? Brand.blue : Colors.white24, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(plan.name,
                      style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text(
                    plan.installments.length > 1
                        ? '${plan.installments.length} installments'
                        : 'Single payment',
                    style: const TextStyle(color: Colors.white38, fontSize: 12),
                  ),
                ],
              ),
            ),
            Text(rupees(plan.totalAmount),
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  final String label;
  final double amount;
  final bool selected;
  final VoidCallback? onTap;

  const _AmountRow({required this.label, required this.amount, required this.selected, this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? Brand.blue.withValues(alpha: 0.12) : Brand.surfaceAlt,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? Brand.blue : Colors.white.withValues(alpha: 0.06)),
        ),
        child: Row(
          children: [
            if (onTap != null) ...[
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  color: selected ? Brand.blue : Colors.white24, size: 18),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Text(label, style: const TextStyle(color: Colors.white70, fontSize: 13.5)),
            ),
            Text(rupees(amount),
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}
