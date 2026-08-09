import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Course thumbnail with a graceful fallback: shows the CDN image when the
/// course has one, else the subject icon on a tinted block (the app's
/// original look). Keeps every card working for courses without images.
class CourseThumb extends StatelessWidget {
  final String? url;
  final IconData fallbackIcon;
  final Color fallbackColor;
  final double width;
  final double height;
  final BorderRadius borderRadius;

  const CourseThumb({
    super.key,
    required this.url,
    required this.fallbackIcon,
    required this.fallbackColor,
    this.width = 46,
    this.height = 46,
    this.borderRadius = const BorderRadius.all(Radius.circular(12)),
  });

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: fallbackColor.withValues(alpha: 0.15),
        borderRadius: borderRadius,
      ),
      child: Icon(fallbackIcon, color: fallbackColor, size: height * 0.5),
    );

    if (url == null || url!.isEmpty) return fallback;

    return ClipRRect(
      borderRadius: borderRadius,
      child: CachedNetworkImage(
        imageUrl: url!,
        width: width,
        height: height,
        fit: BoxFit.cover,
        placeholder: (_, __) => fallback,
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}
