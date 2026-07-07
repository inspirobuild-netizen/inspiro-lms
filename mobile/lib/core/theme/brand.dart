import 'package:flutter/material.dart';

/// When true, the login screen offers a "Demo Mode" that skips OTP/backend.
/// Enable for testing with:  --dart-define=DEMO_MODE=true
/// Leave OFF (default) for production / Play Store builds.
const bool kDemoMode = bool.fromEnvironment('DEMO_MODE', defaultValue: false);

/// Inspiro IAS Academy brand palette (from the logo).
class Brand {
  Brand._();

  static const Color blue = Color(0xFF1668E3); // primary — wordmark
  static const Color red = Color(0xFFC8102E); // the person figure
  static const Color yellow = Color(0xFFFFC629); // the dot / head

  // Design-system functional accents (from the Inspiro PRD design system)
  static const Color teal = Color(0xFF14B8A6); // progress, live, success
  static const Color amber = Color(0xFFF59E0B); // XP, streaks, gamification

  // App surfaces — tonal layering (deep navy base + elevated surfaces)
  static const Color bg = Color(0xFF0D0F1A);
  static const Color surface = Color(0xFF13162A); // Surface 1 (cards, nav)
  static const Color surface2 = Color(0xFF1A1F3A); // Surface 2 (inputs)
  static const Color surface3 = Color(0xFF1E2445); // Surface 3 (modals)
  static const Color surfaceAlt = Color(0xFF1A1F3A);

  static const String logoAsset = 'assets/branding/inspiro_logo.png';
}

/// Renders the Inspiro logo image. Falls back to a styled wordmark if the
/// asset file hasn't been added yet (so the app never crashes on a missing
/// asset during development).
class InspiroLogo extends StatelessWidget {
  final double height;
  final bool showTagline;

  const InspiroLogo({super.key, this.height = 72, this.showTagline = false});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      Brand.logoAsset,
      height: height,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => _FallbackWordmark(
        height: height,
        showTagline: showTagline,
      ),
    );
  }
}

class _FallbackWordmark extends StatelessWidget {
  final double height;
  final bool showTagline;
  const _FallbackWordmark({required this.height, required this.showTagline});

  @override
  Widget build(BuildContext context) {
    final fontSize = height * 0.55;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        RichText(
          text: TextSpan(
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
            children: const [
              TextSpan(text: 'Inspi', style: TextStyle(color: Brand.blue)),
              TextSpan(text: 'v', style: TextStyle(color: Brand.red)),
              TextSpan(text: 'o', style: TextStyle(color: Brand.blue)),
            ],
          ),
        ),
        if (showTagline)
          Text(
            'IAS ACADEMY',
            style: TextStyle(
              color: Brand.blue,
              fontSize: fontSize * 0.28,
              fontWeight: FontWeight.w700,
              letterSpacing: 3,
            ),
          ),
      ],
    );
  }
}
