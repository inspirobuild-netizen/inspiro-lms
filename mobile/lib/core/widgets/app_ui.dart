import 'package:flutter/material.dart';
import '../theme/brand.dart';

/// Ambient brand background — a subtle top gradient with soft colour blobs.
/// Used behind every screen for a cohesive, non-flat look.
class AmbientBackground extends StatelessWidget {
  final bool subtle;
  const AmbientBackground({super.key, this.subtle = false});

  @override
  Widget build(BuildContext context) {
    final a = subtle ? 0.5 : 1.0;
    return Positioned.fill(
      child: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF152244), Brand.bg],
                stops: [0.0, 0.45],
              ),
            ),
          ),
          Positioned(top: -110, right: -80, child: _blob(Brand.blue, 260, 0.22 * a)),
          Positioned(top: 40, left: -100, child: _blob(Brand.red, 200, 0.10 * a)),
          Positioned(bottom: -80, right: -50, child: _blob(Brand.yellow, 200, 0.08 * a)),
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

/// Standard screen scaffold: ambient background + a lightweight transparent
/// header (title, optional back button and trailing actions).
class AppScaffold extends StatelessWidget {
  final String? title;
  final Widget body;
  final bool showBack;
  final List<Widget> actions;
  final Widget? floatingActionButton;
  final bool subtleBackground;

  const AppScaffold({
    super.key,
    this.title,
    required this.body,
    this.showBack = true,
    this.actions = const [],
    this.floatingActionButton,
    this.subtleBackground = false,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      floatingActionButton: floatingActionButton,
      body: Stack(
        children: [
          AmbientBackground(subtle: subtleBackground),
          SafeArea(
            child: Column(
              children: [
                if (title != null || showBack)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 12, 4),
                    child: Row(
                      children: [
                        if (showBack)
                          IconButton(
                            onPressed: () => Navigator.of(context).maybePop(),
                            icon: const Icon(Icons.arrow_back, color: Colors.white),
                          )
                        else
                          const SizedBox(width: 8),
                        if (title != null)
                          Expanded(
                            child: Text(
                              title!,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold),
                            ),
                          )
                        else
                          const Spacer(),
                        ...actions,
                      ],
                    ),
                  ),
                Expanded(child: body),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Page used by bottom-nav TAB screens. Unlike [AppScaffold] it does NOT create
/// a nested Scaffold — it renders into the shell's Scaffold body, so the menu
/// button can open the shell drawer. Header shows a hamburger + title + actions.
class TabPage extends StatelessWidget {
  final String title;
  final Widget body;
  final List<Widget> actions;

  const TabPage({super.key, required this.title, required this.body, this.actions = const []});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const AmbientBackground(),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 12, 4),
                child: Row(
                  children: [
                    Builder(
                      builder: (ctx) => IconButton(
                        onPressed: () => Scaffold.of(ctx).openDrawer(),
                        icon: const Icon(Icons.menu_rounded, color: Colors.white),
                      ),
                    ),
                    Expanded(
                      child: Text(title,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                    ),
                    ...actions,
                  ],
                ),
              ),
              Expanded(child: body),
            ],
          ),
        ),
      ],
    );
  }
}

/// A translucent card surface with soft border + shadow.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? tint;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.tint,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: (tint ?? Brand.surface).withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: card,
      ),
    );
  }
}

/// Section title with an optional trailing action.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const SectionHeader({super.key, required this.title, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title,
              style: const TextStyle(
                  color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
          if (actionLabel != null)
            TextButton(
              onPressed: onAction,
              child: Text(actionLabel!,
                  style: const TextStyle(color: Brand.blue, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

/// Full-width gradient action button with loading state.
class BrandButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final bool loading;
  final IconData? icon;

  const BrandButton({
    super.key,
    required this.label,
    required this.onTap,
    this.loading = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
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
              color: Brand.blue.withValues(alpha: 0.35),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ElevatedButton(
          onPressed: loading ? null : onTap,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: loading
              ? const SizedBox(
                  width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
                    Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Consistent loading / error / empty placeholders.
class LoadingState extends StatelessWidget {
  final String? message;
  const LoadingState({super.key, this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: Brand.blue),
          if (message != null) ...[
            const SizedBox(height: 14),
            Text(message!, style: const TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Brand.blue.withValues(alpha: 0.12),
              ),
              child: Icon(icon, color: Brand.blue, size: 36),
            ),
            const SizedBox(height: 18),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(subtitle!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white38, fontSize: 13, height: 1.5)),
            ],
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off, color: Colors.white38, size: 40),
          const SizedBox(height: 12),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white54, fontSize: 13)),
          const SizedBox(height: 14),
          TextButton(
            onPressed: onRetry,
            child: const Text('Retry', style: TextStyle(color: Brand.blue, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
