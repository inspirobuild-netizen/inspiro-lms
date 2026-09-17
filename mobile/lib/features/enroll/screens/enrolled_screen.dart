import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../../core/auth/auth_provider.dart';

/// The moment after a payment clears. The one screen in the app allowed to
/// be a little warm — a student has just committed money and months to this.
class EnrolledScreen extends ConsumerWidget {
  final String courseId;
  final String courseTitle;
  final String batchName;
  const EnrolledScreen({
    super.key,
    required this.courseId,
    required this.courseTitle,
    required this.batchName,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(authProvider).user?.name.trim().split(' ').first;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        body: Stack(children: [
          const AmbientBackground(),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(28, 40, 28, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Spacer(),
                  Center(
                    child: Container(
                      height: 96, width: 96,
                      decoration: BoxDecoration(
                        color: Brand.teal.withValues(alpha: 0.16),
                        shape: BoxShape.circle,
                        boxShadow: [BoxShadow(color: Brand.teal.withValues(alpha: 0.35), blurRadius: 40, spreadRadius: 4)],
                      ),
                      child: const Icon(Icons.celebration_rounded, color: Brand.teal, size: 48),
                    ),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    name == null || name.isEmpty ? 'Welcome aboard!' : 'Welcome aboard, $name!',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold, height: 1.2),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    "You're enrolled in $courseTitle and placed in $batchName. Your classes, notes and tests are open now.",
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 15, height: 1.5),
                  ),
                  const Spacer(),
                  BrandButton(
                    label: 'Start learning',
                    onTap: () {
                      context.go('/learn');
                      context.push('/course', extra: courseId);
                    },
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: () => context.go('/home'),
                    child: const Text('Go to home'),
                  ),
                ],
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
