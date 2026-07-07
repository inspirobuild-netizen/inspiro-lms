import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/brand.dart';

/// Animated brand splash. Plays a fade + scale-in of the logo, waits for auth
/// state to initialise, then routes to /home or /login.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _logoCtrl;
  late final AnimationController _dotCtrl;
  late final Animation<double> _fade;
  late final Animation<double> _scale;
  late final Animation<double> _taglineFade;

  bool _navigated = false;
  static const _minSplash = Duration(milliseconds: 2000);
  DateTime? _start;

  @override
  void initState() {
    super.initState();
    _start = DateTime.now();

    _logoCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _fade = CurvedAnimation(parent: _logoCtrl, curve: const Interval(0.0, 0.6));
    _scale = Tween(begin: 0.82, end: 1.0).animate(
      CurvedAnimation(parent: _logoCtrl, curve: Curves.easeOutBack),
    );
    _taglineFade = CurvedAnimation(
      parent: _logoCtrl,
      curve: const Interval(0.5, 1.0, curve: Curves.easeIn),
    );

    // Gentle continuous bob of the "dot" accent.
    _dotCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);

    _logoCtrl.forward();
    _maybeNavigate();
  }

  Future<void> _maybeNavigate() async {
    // Wait until both the minimum splash time has elapsed and auth is ready.
    while (mounted) {
      final auth = ref.read(authProvider);
      final elapsed = DateTime.now().difference(_start!);
      if (auth.initialised && elapsed >= _minSplash) break;
      await Future<void>.delayed(const Duration(milliseconds: 80));
    }
    if (!mounted || _navigated) return;
    _navigated = true;
    final loggedIn = ref.read(authProvider).isAuthenticated;
    context.go(loggedIn ? '/home' : '/login');
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    _dotCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Spacer(flex: 3),
            AnimatedBuilder(
              animation: _logoCtrl,
              builder: (_, child) => Opacity(
                opacity: _fade.value,
                child: Transform.scale(scale: _scale.value, child: child),
              ),
              child: const InspiroLogo(height: 96, showTagline: true),
            ),
            const Spacer(flex: 3),
            // Brand-coloured loading dots
            FadeTransition(
              opacity: _taglineFade,
              child: _LoadingDots(controller: _dotCtrl),
            ),
            const SizedBox(height: 48),
            FadeTransition(
              opacity: _taglineFade,
              child: const Text(
                'by Bizence Solutions',
                style: TextStyle(color: Colors.black26, fontSize: 11),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _LoadingDots extends StatelessWidget {
  final AnimationController controller;
  const _LoadingDots({required this.controller});

  static const _colors = [Brand.blue, Brand.red, Brand.yellow];

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        return AnimatedBuilder(
          animation: controller,
          builder: (_, __) {
            final t = (controller.value + i * 0.2) % 1.0;
            final lift = -6 * (1 - (2 * t - 1).abs());
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              child: Transform.translate(
                offset: Offset(0, lift),
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: _colors[i],
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            );
          },
        );
      }),
    );
  }
}
