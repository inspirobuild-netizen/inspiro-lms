import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../../courses/models/course.dart';
import '../../courses/providers/courses_provider.dart';
import '../providers/enroll_provider.dart';

String rupees(num n) {
  final s = n.round().toString();
  // Indian grouping: last 3 digits, then pairs (12,34,567).
  if (s.length <= 3) return '₹$s';
  final last3 = s.substring(s.length - 3);
  var rest = s.substring(0, s.length - 3);
  final buf = <String>[];
  while (rest.length > 2) {
    buf.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) buf.insert(0, rest);
  return '₹${buf.join(',')},$last3';
}

/// The marketing catalog every signed-in student can browse, enrolled or not.
/// Shows title/subject/description/price only — no syllabus until they've
/// paid and staff has verified (enforced server-side, not just hidden here).
class CatalogScreen extends ConsumerWidget {
  const CatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalogAsync = ref.watch(catalogProvider);
    final pendingAsync = ref.watch(myEnrollRequestsProvider);

    return AppScaffold(
      title: 'Explore courses',
      body: catalogAsync.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(
          message: 'Could not load courses',
          onRetry: () => ref.invalidate(catalogProvider),
        ),
        data: (courses) {
          if (courses.isEmpty) {
            return const EmptyState(
              icon: Icons.storefront_outlined,
              title: 'No courses available yet',
              subtitle: 'Check back soon — new batches are added regularly.',
            );
          }

          final pending = pendingAsync.asData?.value
                  .where((r) => r.status == 'pending')
                  .map((r) => r.courseId)
                  .toSet() ??
              const <String>{};

          return RefreshIndicator(
            color: Brand.blue,
            backgroundColor: Brand.surface,
            onRefresh: () async {
              ref.invalidate(catalogProvider);
              ref.invalidate(myEnrollRequestsProvider);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
              children: [
                const Text(
                  'Pick a course, pay securely by UPI, and start learning once our team confirms your payment.',
                  style: TextStyle(color: Colors.white38, fontSize: 13, height: 1.5),
                ),
                const SizedBox(height: 20),
                ...courses.map((c) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: _CatalogCard(
                        course: c,
                        awaitingVerification: pending.contains(c.id),
                        onTap: () => context.push('/enroll', extra: c),
                      ),
                    )),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CatalogCard extends StatelessWidget {
  final Course course;
  final bool awaitingVerification;
  final VoidCallback onTap;

  const _CatalogCard({
    required this.course,
    required this.awaitingVerification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: awaitingVerification ? null : onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Brand.blue.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.menu_book_rounded, color: Brand.blue, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(course.title,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(course.subject,
                        style: const TextStyle(color: Colors.white38, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          if (course.description != null && course.description!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(course.description!,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white54, fontSize: 13, height: 1.5)),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: course.feeAmount > 0
                    ? Text(rupees(course.feeAmount),
                        style: const TextStyle(
                            color: Colors.white, fontSize: 19, fontWeight: FontWeight.bold))
                    : const Text('Free',
                        style: TextStyle(
                            color: Brand.teal, fontSize: 17, fontWeight: FontWeight.bold)),
              ),
              if (awaitingVerification)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Brand.amber.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('Awaiting verification',
                      style: TextStyle(color: Brand.amber, fontSize: 12, fontWeight: FontWeight.w600)),
                )
              else
                ElevatedButton(
                  onPressed: onTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Brand.blue,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Enrol',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
