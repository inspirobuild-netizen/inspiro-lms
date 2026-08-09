import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

/// Shown exactly once, right after a brand-new self-signup's first OTP
/// verify (the backend marks a fresh account with the placeholder name
/// "New User" — the router redirects here until that's replaced with a
/// real one). Counsellor-admitted students already have a real name set at
/// admission time, so they never see this screen.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _nameCtrl = TextEditingController();
  String _targetExam = 'kerala_psc';
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.length < 2) {
      setState(() => _error = 'Enter your full name');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.dio.patch<Map<String, dynamic>>(
        '/api/v1/profile/me',
        data: {'name': name, 'targetExam': _targetExam},
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      final auth = ref.read(authProvider);
      final current = auth.user!;
      await ref.read(authProvider.notifier).setAuth(
            AuthUser(
              id: current.id,
              name: (data['name'] as String?) ?? name,
              phone: current.phone,
              role: current.role,
              avatarUrl: current.avatarUrl,
            ),
            auth.accessToken!,
          );
      if (mounted) context.go('/home');
    } on DioException catch (e) {
      setState(() {
        _error = e.message ?? 'Could not save your profile. Try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      body: Stack(
        children: [
          const AmbientBackground(),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const InspiroLogo(height: 56),
                  const SizedBox(height: 28),
                  const Text('One last step',
                      style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  const Text("Tell us who you are so we can personalise your prep",
                      style: TextStyle(color: Colors.white38, fontSize: 13, height: 1.4)),
                  const SizedBox(height: 28),
                  const Text('Full name',
                      style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _nameCtrl,
                    textCapitalization: TextCapitalization.words,
                    style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                    cursorColor: Brand.blue,
                    decoration: _fieldDecoration('Your full name'),
                    onSubmitted: (_) => _save(),
                  ),
                  const SizedBox(height: 20),
                  const Text('Which exam are you preparing for?',
                      style: TextStyle(color: Colors.white60, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _ExamChip(label: 'Kerala PSC', value: 'kerala_psc', selected: _targetExam == 'kerala_psc', onTap: () => setState(() => _targetExam = 'kerala_psc')),
                      _ExamChip(label: 'UPSC', value: 'upsc', selected: _targetExam == 'upsc', onTap: () => setState(() => _targetExam = 'upsc')),
                      _ExamChip(label: 'Other PSC', value: 'other_psc', selected: _targetExam == 'other_psc', onTap: () => setState(() => _targetExam = 'other_psc')),
                    ],
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: Brand.red.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Brand.red.withValues(alpha: 0.3)),
                      ),
                      child: Row(children: [
                        const Icon(Icons.error_outline, color: Brand.red, size: 18),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_error!, style: const TextStyle(color: Color(0xFFFF8A9B), fontSize: 12.5))),
                      ]),
                    ),
                  ],
                  const SizedBox(height: 26),
                  BrandButton(label: 'Continue', loading: _loading, onTap: _save),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _fieldDecoration(String hint) => InputDecoration(
        hintText: hint,
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
      );
}

class _ExamChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;

  const _ExamChip({required this.label, required this.value, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? Brand.blue : Brand.surfaceAlt,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? Brand.blue : Colors.white.withValues(alpha: 0.08)),
        ),
        child: Text(label,
            style: TextStyle(color: selected ? Colors.white : Colors.white60, fontSize: 13, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
