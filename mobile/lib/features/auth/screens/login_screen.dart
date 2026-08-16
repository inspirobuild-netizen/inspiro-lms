import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/brand.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  bool _otpSent = false;
  bool _useEmailLogin = false;
  bool _obscurePassword = true;
  bool _loading = false;
  // Sign up vs Log in is pure framing — the backend's verify-otp creates the
  // account on first use either way. Defaults to Sign up for fresh installs.
  bool _isSignup = true;
  String? _error;
  int _resendCountdown = 0;

  void _startResendTimer(int secs) {
    setState(() => _resendCountdown = secs);
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() => _resendCountdown--);
      return _resendCountdown > 0;
    });
  }

  Future<void> _sendOtp() async {
    final phone = _phoneCtrl.text.trim();
    if (!RegExp(r'^\d{10}$').hasMatch(phone)) {
      setState(() => _error = 'Enter a valid 10-digit number');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/auth/send-otp',
        data: {'phone': '91$phone'},
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      _startResendTimer((data['resendAfter'] as num).toInt());
      setState(() {
        _otpSent = true;
        _loading = false;
      });
    } on DioException catch (e) {
      setState(() {
        _error = _friendlyError(e);
        _loading = false;
      });
    }
  }

  Future<void> _verifyOtp() async {
    final phone = _phoneCtrl.text.trim();
    final otp = _otpCtrl.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      setState(() => _error = 'Enter the 6-digit OTP');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/auth/verify-otp',
        data: {'phone': '91$phone', 'otp': otp},
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
      final token = data['accessToken'] as String;
      await ref.read(authProvider.notifier).setAuth(user, token);
      if (mounted) context.go('/home');
    } on DioException catch (e) {
      setState(() {
        _error = _friendlyError(e);
        _loading = false;
      });
    }
  }

  Future<void> _loginWithEmail() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Enter a valid email address');
      return;
    }
    if (password.isEmpty) {
      setState(() => _error = 'Enter your password');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/auth/login',
        data: {'email': email, 'password': password},
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
      final token = data['accessToken'] as String;
      await ref.read(authProvider.notifier).setAuth(user, token);
      if (mounted) context.go('/home');
    } on DioException catch (e) {
      setState(() {
        _error = _friendlyError(e);
        _loading = false;
      });
    }
  }

  Future<void> _demoLogin() async {
    await ref.read(authProvider.notifier).setAuth(
          const AuthUser(
            id: 'demo-user',
            name: 'Demo Aspirant',
            phone: '9999999999',
            role: 'student',
          ),
          'demo-token',
        );
    if (mounted) context.go('/home');
  }

  String _friendlyError(DioException e) {
    if (e.type == DioExceptionType.connectionError ||
        e.error.toString().contains('Failed host lookup')) {
      // The Demo Mode button this used to point at only renders when built
      // with --dart-define=DEMO_MODE=true, so in a release build it told
      // users to tap something that isn't on the screen.
      return kDemoMode
          ? 'Cannot reach the server. Check your connection or try Demo Mode below.'
          : 'Cannot reach the server. Check your internet connection and try again.';
    }
    return e.message ?? 'Something went wrong. Please try again.';
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      body: Stack(
        children: [
          const _AmbientBackground(),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 48),
                  // Brand logo on a white card
                  Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: Brand.blue.withValues(alpha: 0.35),
                            blurRadius: 40,
                            spreadRadius: -4,
                            offset: const Offset(0, 12),
                          ),
                        ],
                      ),
                      child: const InspiroLogo(height: 56, showTagline: true),
                    ),
                  ),
                  const SizedBox(height: 22),
                  const Center(
                    child: Text(
                      'Your civil services journey starts here',
                      style: TextStyle(color: Colors.white54, fontSize: 13.5),
                    ),
                  ),
                  const SizedBox(height: 14),
                  // Feature chips
                  const Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _FeatureChip(icon: Icons.workspace_premium_outlined, label: 'UPSC'),
                      _FeatureChip(icon: Icons.account_balance_outlined, label: 'Kerala PSC'),
                      _FeatureChip(icon: Icons.auto_awesome, label: 'AI Powered'),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // Sign up / Log in toggle (hidden mid-OTP and on the email
                  // path — switching then would be confusing)
                  if (!_useEmailLogin && !_otpSent) ...[
                    _SegmentedToggle(
                      isSignup: _isSignup,
                      onChanged: _loading
                          ? null
                          : (v) => setState(() {
                                _isSignup = v;
                                _error = null;
                              }),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Form card
                  _GlassCard(
                    child: _useEmailLogin
                        ? _buildEmailStep()
                        : (_otpSent ? _buildOtpStep() : _buildPhoneStep()),
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: TextButton(
                      onPressed: _loading
                          ? null
                          : () => setState(() {
                                _useEmailLogin = !_useEmailLogin;
                                _error = null;
                              }),
                      // Presented as a first-class option, not a debug hatch.
                      // It is the only path that works until MSG91 DLT approval
                      // lands, it is how existing students sign in, and it is
                      // how an App Store reviewer uses the demo account — a
                      // control labelled "(testing)" reads as unfinished.
                      child: Text(
                        _useEmailLogin
                            ? 'Use mobile number instead'
                            : 'Sign in with email instead',
                        style: const TextStyle(
                            color: Brand.blue,
                            fontSize: 13,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),

                  if (kDemoMode) ...[
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        const Expanded(child: Divider(color: Colors.white12)),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text('or',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 12)),
                        ),
                        const Expanded(child: Divider(color: Colors.white12)),
                      ],
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _demoLogin,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Brand.yellow,
                        side: BorderSide(color: Brand.yellow.withValues(alpha: 0.5)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      icon: const Icon(Icons.explore_outlined, size: 18),
                      label: const Text('Explore in Demo Mode',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ],

                  const SizedBox(height: 32),
                  Center(
                    child: Text(
                      'by Bizence Solutions',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.22), fontSize: 11),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Phone step ──────────────────────────────────────────────────────────────
  Widget _buildPhoneStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(_isSignup ? 'Create your account 🚀' : 'Welcome back 👋',
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(
            _isSignup
                ? 'Join with your mobile number — free to browse courses'
                : 'Log in with your registered mobile number',
            style: const TextStyle(color: Colors.white38, fontSize: 13)),
        const SizedBox(height: 22),
        const Text('Mobile number',
            style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(height: 10),
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
              decoration: BoxDecoration(
                color: Brand.surfaceAlt,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: const Text('🇮🇳  +91',
                  style: TextStyle(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                style: const TextStyle(
                    color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: 1),
                cursorColor: Brand.blue,
                decoration: _fieldDecoration('98765 43210'),
                onSubmitted: (_) => _sendOtp(),
              ),
            ),
          ],
        ),
        if (_error != null) _errorBox(),
        const SizedBox(height: 22),
        _primaryButton(label: _isSignup ? 'Sign up with OTP' : 'Send OTP', onTap: _sendOtp),
        const SizedBox(height: 12),
        const Center(
          child: Text('We will send a one-time code to verify your number',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white24, fontSize: 11.5, height: 1.4)),
        ),
      ],
    );
  }

  // ── Email + password step ──────────────────────────────────────────────────
  Widget _buildEmailStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Welcome 👋',
            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        const Text('Sign in with your email and password',
            style: TextStyle(color: Colors.white38, fontSize: 13)),
        const SizedBox(height: 22),
        const Text('Email', style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(height: 10),
        TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
          cursorColor: Brand.blue,
          decoration: _fieldDecoration('you@example.com'),
        ),
        const SizedBox(height: 18),
        const Text('Password', style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(height: 10),
        TextField(
          controller: _passwordCtrl,
          obscureText: _obscurePassword,
          style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
          cursorColor: Brand.blue,
          onSubmitted: (_) => _loginWithEmail(),
          decoration: _fieldDecoration('••••••••').copyWith(
            suffixIcon: IconButton(
              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: Colors.white38, size: 20),
            ),
          ),
        ),
        if (_error != null) _errorBox(),
        const SizedBox(height: 22),
        _primaryButton(label: 'Sign in', onTap: _loginWithEmail),
      ],
    );
  }

  // ── OTP step ────────────────────────────────────────────────────────────────
  Widget _buildOtpStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            InkWell(
              onTap: () => setState(() {
                _otpSent = false;
                _error = null;
                _otpCtrl.clear();
              }),
              borderRadius: BorderRadius.circular(10),
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(Icons.arrow_back, color: Colors.white54, size: 20),
              ),
            ),
            const SizedBox(width: 8),
            const Text('Verify OTP',
                style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Text.rich(
            TextSpan(
              style: const TextStyle(color: Colors.white38, fontSize: 13, height: 1.4),
              children: [
                const TextSpan(text: 'Enter the 6-digit code sent to\n'),
                TextSpan(
                  text: '+91 ${_phoneCtrl.text}',
                  style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        _OtpInput(
          controller: _otpCtrl,
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          onCompleted: (_) => _verifyOtp(),
        ),
        if (_error != null) _errorBox(),
        const SizedBox(height: 24),
        _primaryButton(label: 'Verify & Sign in', onTap: _verifyOtp),
        const SizedBox(height: 16),
        Center(
          child: _resendCountdown > 0
              ? Text('Resend code in ${_resendCountdown}s',
                  style: const TextStyle(color: Colors.white38, fontSize: 13))
              : TextButton(
                  onPressed: _sendOtp,
                  child: const Text('Resend OTP',
                      style: TextStyle(color: Brand.blue, fontSize: 14, fontWeight: FontWeight.w600)),
                ),
        ),
      ],
    );
  }

  // ── Shared bits ─────────────────────────────────────────────────────────────
  InputDecoration _fieldDecoration(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white24, letterSpacing: 1),
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
      );

  Widget _errorBox() {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Brand.red.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Brand.red.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline, color: Brand.red, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(_error!,
                  style: const TextStyle(color: Color(0xFFFF8A9B), fontSize: 12.5, height: 1.35)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _primaryButton({required String label, required VoidCallback onTap}) {
    return SizedBox(
      height: 54,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: const LinearGradient(
            colors: [Brand.blue, Color(0xFF0B4FC4)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          boxShadow: [
            BoxShadow(
              color: Brand.blue.withValues(alpha: 0.4),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ElevatedButton(
          onPressed: _loading ? null : onTap,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: _loading
              ? const SizedBox(
                  width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
              : Text(label,
                  style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}

// ── Ambient decorative background ──────────────────────────────────────────────
class _AmbientBackground extends StatelessWidget {
  const _AmbientBackground();

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF152244), Brand.bg],
                stops: [0.0, 0.5],
              ),
            ),
          ),
          Positioned(top: -90, right: -70, child: _blob(Brand.blue, 240, 0.28)),
          Positioned(top: 60, left: -90, child: _blob(Brand.red, 200, 0.14)),
          Positioned(bottom: -60, right: -40, child: _blob(Brand.yellow, 180, 0.10)),
        ],
      ),
    );
  }

  Widget _blob(Color color, double size, double opacity) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color.withValues(alpha: opacity), color.withValues(alpha: 0)],
          ),
        ),
      );
}

/// Sign up | Log in segmented control.
class _SegmentedToggle extends StatelessWidget {
  final bool isSignup;
  final ValueChanged<bool>? onChanged;
  const _SegmentedToggle({required this.isSignup, this.onChanged});

  @override
  Widget build(BuildContext context) {
    Widget seg(String label, bool value) {
      final selected = isSignup == value;
      return Expanded(
        child: GestureDetector(
          onTap: onChanged == null ? null : () => onChanged!(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 11),
            decoration: BoxDecoration(
              color: selected ? Brand.blue : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Text(label,
                style: TextStyle(
                    color: selected ? Colors.white : Colors.white54,
                    fontSize: 14,
                    fontWeight: FontWeight.w700)),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(children: [seg('Sign up', true), seg('Log in', false)]),
    );
  }
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Brand.surface.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _FeatureChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FeatureChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Brand.blue),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

// ── 6-box OTP input (no external package) ──────────────────────────────────────
class _OtpInput extends StatefulWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onCompleted;

  const _OtpInput({
    required this.controller,
    required this.onChanged,
    required this.onCompleted,
  });

  @override
  State<_OtpInput> createState() => _OtpInputState();
}

class _OtpInputState extends State<_OtpInput> {
  static const int length = 6;
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = widget.controller.text;
    return GestureDetector(
      onTap: () => _focus.requestFocus(),
      child: Stack(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(length, (i) {
              final filled = i < text.length;
              final active = _focus.hasFocus && i == text.length;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 46,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Brand.surfaceAlt,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: active
                        ? Brand.blue
                        : filled
                            ? Brand.blue.withValues(alpha: 0.4)
                            : Colors.white.withValues(alpha: 0.08),
                    width: active ? 1.8 : 1.2,
                  ),
                ),
                child: Text(
                  filled ? text[i] : '',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                ),
              );
            }),
          ),
          Positioned.fill(
            child: Opacity(
              opacity: 0,
              child: TextField(
                controller: widget.controller,
                focusNode: _focus,
                keyboardType: TextInputType.number,
                showCursor: false,
                enableInteractiveSelection: false,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(length),
                ],
                decoration: const InputDecoration(border: InputBorder.none),
                onChanged: (v) {
                  setState(() {});
                  widget.onChanged(v);
                  if (v.length == length) widget.onCompleted(v);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
