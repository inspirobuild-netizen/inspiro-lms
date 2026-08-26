import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/brand.dart';

/// A promo banner published from the admin panel.
class HomeBanner {
  final String id;
  final String title;
  final String imageUrl;
  final String? courseId;

  const HomeBanner({
    required this.id,
    required this.title,
    required this.imageUrl,
    this.courseId,
  });

  factory HomeBanner.fromJson(Map<String, dynamic> j) => HomeBanner(
        id: j['id'] as String,
        title: j['title'] as String,
        imageUrl: j['imageUrl'] as String,
        courseId: j['courseId'] as String?,
      );
}

/// Server already filters to active banners inside their date window and
/// returns them in display order, so the app renders the list as given.
final bannersProvider = FutureProvider<List<HomeBanner>>((ref) async {
  final res = await ApiClient.dio.get<Map<String, dynamic>>('/api/v1/banners');
  return (res.data!['data'] as List)
      .cast<Map<String, dynamic>>()
      .map(HomeBanner.fromJson)
      .toList();
});

/// Auto-sliding banner rail for the home screen.
///
/// Renders nothing at all when there are no banners — an empty placeholder
/// box on the home screen looks like a loading failure. Auto-advance stops
/// as soon as the student swipes, so it never fights them for control.
class BannerRail extends ConsumerStatefulWidget {
  const BannerRail({super.key});

  @override
  ConsumerState<BannerRail> createState() => _BannerRailState();
}

class _BannerRailState extends ConsumerState<BannerRail> {
  final _controller = PageController(viewportFraction: 0.92);
  Timer? _timer;
  int _page = 0;
  bool _userTookOver = false;

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _startAutoSlide(int count) {
    if (count < 2 || _timer != null || _userTookOver) return;
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_page + 1) % count;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final bannersAsync = ref.watch(bannersProvider);

    return bannersAsync.maybeWhen(
      orElse: () => const SizedBox.shrink(),
      data: (banners) {
        if (banners.isEmpty) return const SizedBox.shrink();
        _startAutoSlide(banners.length);

        return Column(
          children: [
            SizedBox(
              height: 148,
              child: NotificationListener<ScrollNotification>(
                // A drag means the student is browsing — stop auto-advancing
                // rather than yanking the page out from under their thumb.
                onNotification: (n) {
                  if (n is UserScrollNotification) {
                    _userTookOver = true;
                    _timer?.cancel();
                    _timer = null;
                  }
                  return false;
                },
                child: PageView.builder(
                  controller: _controller,
                  itemCount: banners.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, i) => _BannerCard(banner: banners[i]),
                ),
              ),
            ),
            if (banners.length > 1) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(banners.length, (i) {
                  final active = i == _page;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: active ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: active ? Brand.blue : Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              ),
            ],
            const SizedBox(height: 18),
          ],
        );
      },
    );
  }
}

class _BannerCard extends StatelessWidget {
  final HomeBanner banner;
  const _BannerCard({required this.banner});

  @override
  Widget build(BuildContext context) {
    final tappable = banner.courseId != null;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 5),
      child: GestureDetector(
        onTap: tappable ? () => context.push('/course', extra: banner.courseId) : null,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(
            fit: StackFit.expand,
            children: [
              CachedNetworkImage(
                imageUrl: banner.imageUrl,
                fit: BoxFit.cover,
                placeholder: (_, __) => Container(color: Brand.surfaceAlt),
                // A broken image must not leave a blank card with unreadable
                // text over it — fall back to a branded panel.
                errorWidget: (_, __, ___) => Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Brand.blue, Color(0xFF0B4FC4)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                ),
              ),
              // Scrim: titles sit on arbitrary uploaded artwork, so the text
              // needs its own contrast rather than trusting the image.
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0xCC000000)],
                    stops: [0.45, 1.0],
                  ),
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 14,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        banner.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          height: 1.3,
                          shadows: [Shadow(color: Colors.black54, blurRadius: 8)],
                        ),
                      ),
                    ),
                    if (tappable)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Brand.blue,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text('View',
                            style: TextStyle(
                                color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.bold)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
