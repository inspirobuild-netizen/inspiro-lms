import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../courses/providers/courses_provider.dart';
import '../../courses/widgets/course_thumb.dart';
import '../../enroll/providers/enroll_provider.dart';
import '../../enroll/screens/catalog_screen.dart' show rupees;
import '../../home/providers/my_batch_provider.dart';

/// "Subscription" = what the student is actually enrolled in, plus any
/// enrolment request still awaiting staff verification. Built from real
/// endpoints (/courses, /batches/my, /me/enroll) — previously a dead menu
/// item that only showed a "coming soon" snackbar.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);
    final batches = ref.watch(myCourseBatchesProvider).asData?.value ?? const <String, String>{};
    final progress = ref.watch(courseProgressProvider).asData?.value ?? const {};
    final requestsAsync = ref.watch(myEnrollRequestsProvider);

    return AppScaffold(
      title: 'My subscription',
      body: RefreshIndicator(
        color: Brand.blue,
        backgroundColor: Brand.surface,
        onRefresh: () async {
          ref.invalidate(coursesProvider);
          ref.invalidate(myCourseBatchesProvider);
          ref.invalidate(courseProgressProvider);
          ref.invalidate(myEnrollRequestsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          children: [
            // ── Pending verification ─────────────────────────────────────
            ...?requestsAsync.asData?.value
                .where((r) => r.status == 'pending')
                .map((r) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: GlassCard(
                        tint: Brand.surface2,
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Brand.amber.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.hourglass_top_rounded, color: Brand.amber, size: 22),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Awaiting verification',
                                      style: TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 3),
                                  Text(
                                    '${rupees(r.amount)} submitted${r.reference != null ? ' · Ref ${r.reference}' : ''}. '
                                    'Our team will activate your course once the payment is confirmed.',
                                    style: const TextStyle(color: Colors.white54, fontSize: 12.5, height: 1.45),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    )),

            // ── Active enrolments ────────────────────────────────────────
            coursesAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: LoadingState(),
              ),
              error: (_, __) => ErrorRetry(
                message: 'Could not load your subscription',
                onRetry: () => ref.invalidate(coursesProvider),
              ),
              data: (courses) {
                if (courses.isEmpty) {
                  return EmptyState(
                    icon: Icons.card_membership_outlined,
                    title: 'No active subscription',
                    subtitle: 'Enrol in a course to unlock lessons, tests and live classes.',
                    action: SizedBox(
                      width: 220,
                      child: BrandButton(
                        label: 'Explore courses',
                        icon: Icons.storefront_outlined,
                        onTap: () => context.push('/catalog'),
                      ),
                    ),
                  );
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionHeader(title: 'Active courses'),
                    ...courses.map((c) {
                      final p = progress[c.id];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: GlassCard(
                          onTap: () => context.push('/course', extra: c.id),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  // Same thumbnail the home/learn cards use, so
                                  // a course looks like itself everywhere.
                                  CourseThumb(
                                    url: c.thumbnailUrl,
                                    fallbackIcon: Icons.verified_rounded,
                                    fallbackColor: Brand.teal,
                                    width: 52,
                                    height: 52,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(c.title,
                                            style: const TextStyle(
                                                color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                                        const SizedBox(height: 2),
                                        Text(c.subject,
                                            style: const TextStyle(color: Colors.white38, fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              if (batches[c.id] != null) ...[
                                const SizedBox(height: 12),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: Brand.amber.withValues(alpha: 0.13),
                                    borderRadius: BorderRadius.circular(7),
                                  ),
                                  child: Text(batches[c.id]!,
                                      style: const TextStyle(
                                          color: Brand.amber, fontSize: 11.5, fontWeight: FontWeight.w600)),
                                ),
                              ],
                              if (p != null && p.hasLessons) ...[
                                const SizedBox(height: 14),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: LinearProgressIndicator(
                                    value: p.percent / 100,
                                    minHeight: 5,
                                    backgroundColor: Colors.white.withValues(alpha: 0.08),
                                    valueColor: const AlwaysStoppedAnimation(Brand.teal),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text('${p.completed} of ${p.total} lessons · ${p.percent}% complete',
                                    style: const TextStyle(color: Colors.white38, fontSize: 11.5)),
                              ],
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton.icon(
                        onPressed: () => context.push('/catalog'),
                        icon: const Icon(Icons.add_rounded, color: Brand.blue, size: 18),
                        label: const Text('Enrol in another course',
                            style: TextStyle(color: Brand.blue, fontSize: 13, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
