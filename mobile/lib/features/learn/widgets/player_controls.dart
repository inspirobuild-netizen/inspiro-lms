import 'dart:async';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import '../../../core/theme/brand.dart';

/// A quality option handed down by the API (one signed MP4 per rendition).
class VideoQuality {
  final String label;
  final String url;
  const VideoQuality({required this.label, required this.url});

  factory VideoQuality.fromJson(Map<String, dynamic> j) =>
      VideoQuality(label: j['label'] as String, url: j['url'] as String);
}

/// Custom control overlay for the lesson player.
///
/// Deliberately not media_kit's stock controls: those are desktop-flavoured
/// and read as a debug harness on a phone. This is the layer students actually
/// touch, so it gets gesture seeking, a scrub bar that shows buffering, speed
/// and quality pickers, and controls that get out of the way on their own.
class PlayerControls extends StatefulWidget {
  final Player player;
  final String title;
  final List<VideoQuality> qualities;
  final String currentQuality;
  final ValueChanged<VideoQuality> onQualityChanged;
  final VoidCallback onToggleFullscreen;
  final bool isFullscreen;
  final VoidCallback? onBack;

  const PlayerControls({
    super.key,
    required this.player,
    required this.title,
    required this.qualities,
    required this.currentQuality,
    required this.onQualityChanged,
    required this.onToggleFullscreen,
    required this.isFullscreen,
    this.onBack,
  });

  @override
  State<PlayerControls> createState() => _PlayerControlsState();
}

class _PlayerControlsState extends State<PlayerControls> with TickerProviderStateMixin {
  static const _hideAfter = Duration(seconds: 3);
  static const _skip = Duration(seconds: 10);

  bool _visible = true;
  bool _scrubbing = false;
  double _scrubTo = 0;
  Timer? _hideTimer;

  // Double-tap seek ripple: which side, and a key to restart the animation.
  int _rippleSide = 0; // -1 back, 1 forward
  int _rippleSeconds = 0;
  Timer? _rippleTimer;

  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  Duration _buffer = Duration.zero;
  bool _playing = false;
  bool _buffering = false;
  double _speed = 1.0;

  final List<StreamSubscription<dynamic>> _subs = [];

  @override
  void initState() {
    super.initState();
    final p = widget.player;
    _position = p.state.position;
    _duration = p.state.duration;
    _playing = p.state.playing;
    _subs.addAll([
      p.stream.position.listen((v) => mounted ? setState(() => _position = v) : null),
      p.stream.duration.listen((v) => mounted ? setState(() => _duration = v) : null),
      p.stream.buffer.listen((v) => mounted ? setState(() => _buffer = v) : null),
      p.stream.playing.listen((v) {
        if (!mounted) return;
        setState(() => _playing = v);
        if (v) _scheduleHide();
      }),
      p.stream.buffering.listen((v) => mounted ? setState(() => _buffering = v) : null),
    ]);
    _scheduleHide();
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _rippleTimer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    // Never auto-hide while paused — a student reading the screen paused
    // shouldn't have the controls vanish from under them.
    if (!_playing) return;
    _hideTimer = Timer(_hideAfter, () {
      if (mounted && !_scrubbing) setState(() => _visible = false);
    });
  }

  void _showControls() {
    setState(() => _visible = true);
    _scheduleHide();
  }

  void _toggleControls() {
    setState(() => _visible = !_visible);
    if (_visible) _scheduleHide();
  }

  Future<void> _seekBy(Duration delta) async {
    final target = _position + delta;
    final clamped = target < Duration.zero
        ? Duration.zero
        : (target > _duration ? _duration : target);
    await widget.player.seek(clamped);
  }

  void _doubleTapSeek(int side) {
    // Tapping repeatedly accumulates, the way YouTube does, rather than
    // firing independent 10s jumps that fight each other.
    _rippleTimer?.cancel();
    setState(() {
      if (_rippleSide != side) _rippleSeconds = 0;
      _rippleSide = side;
      _rippleSeconds += _skip.inSeconds;
    });
    _seekBy(Duration(seconds: _skip.inSeconds * side));
    _rippleTimer = Timer(const Duration(milliseconds: 800), () {
      if (mounted) setState(() => _rippleSide = 0);
    });
  }

  static String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(h > 0 ? 2 : 1, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final total = _duration.inMilliseconds.toDouble();
    final pos = _scrubbing ? _scrubTo : _position.inMilliseconds.toDouble();

    return Stack(
      fit: StackFit.expand,
      children: [
        // Gesture layer: single tap toggles, double tap seeks by side.
        Row(
          children: [
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _toggleControls,
                onDoubleTap: () => _doubleTapSeek(-1),
              ),
            ),
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _toggleControls,
                onDoubleTap: () => _doubleTapSeek(1),
              ),
            ),
          ],
        ),

        if (_rippleSide != 0) _SeekRipple(side: _rippleSide, seconds: _rippleSeconds),

        // Buffering spinner sits above the scrim so it stays visible when the
        // controls have faded out.
        if (_buffering)
          const Center(
            child: SizedBox(
              width: 46, height: 46,
              child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white),
            ),
          ),

        IgnorePointer(
          ignoring: !_visible,
          child: AnimatedOpacity(
            opacity: _visible ? 1 : 0,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xB3000000), Color(0x33000000), Color(0xCC000000)],
                  stops: [0.0, 0.45, 1.0],
                ),
              ),
              child: Column(
                children: [
                  _topBar(),
                  Expanded(child: Center(child: _centerControls())),
                  _bottomBar(pos, total),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _topBar() {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 8, 0),
        child: Row(
          children: [
            if (widget.onBack != null)
              IconButton(
                onPressed: widget.onBack,
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                tooltip: 'Back',
              ),
            Expanded(
              child: Text(
                widget.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w600),
              ),
            ),
            _pillButton(
              label: '${_speed == 1.0 ? '1' : _speed.toString().replaceAll(RegExp(r'0$'), '')}x',
              onTap: _openSpeedSheet,
            ),
            const SizedBox(width: 8),
            if (widget.qualities.length > 1)
              _pillButton(label: widget.currentQuality, onTap: _openQualitySheet),
          ],
        ),
      ),
    );
  }

  Widget _pillButton({required String label, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: () {
        _showControls();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label,
            style: const TextStyle(
                color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _centerControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _circleIcon(Icons.replay_10, 26, () {
          _showControls();
          _seekBy(-_skip);
        }),
        const SizedBox(width: 30),
        GestureDetector(
          onTap: () {
            widget.player.playOrPause();
            _showControls();
          },
          child: Container(
            width: 68,
            height: 68,
            decoration: BoxDecoration(
              color: Brand.blue,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                    color: Brand.blue.withValues(alpha: 0.45),
                    blurRadius: 22,
                    spreadRadius: -2),
              ],
            ),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 160),
              child: Icon(
                _playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                key: ValueKey(_playing),
                color: Colors.white,
                size: 40,
              ),
            ),
          ),
        ),
        const SizedBox(width: 30),
        _circleIcon(Icons.forward_10, 26, () {
          _showControls();
          _seekBy(_skip);
        }),
      ],
    );
  }

  Widget _circleIcon(IconData icon, double size, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: Colors.white, size: size),
      ),
    );
  }

  Widget _bottomBar(double pos, double total) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: 26,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Buffered range, behind the playable track.
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: LayoutBuilder(
                      builder: (_, c) => Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          height: 3,
                          width: total <= 0
                              ? 0
                              : c.maxWidth * (_buffer.inMilliseconds / total).clamp(0.0, 1.0),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.32),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                    ),
                  ),
                  SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 3,
                      activeTrackColor: Brand.blue,
                      inactiveTrackColor: Colors.white.withValues(alpha: 0.18),
                      thumbColor: Colors.white,
                      overlayColor: Brand.blue.withValues(alpha: 0.25),
                      thumbShape: RoundSliderThumbShape(
                          enabledThumbRadius: _scrubbing ? 9 : 6.5),
                      overlayShape: const RoundSliderOverlayShape(overlayRadius: 18),
                    ),
                    child: Slider(
                      min: 0,
                      max: total <= 0 ? 1 : total,
                      value: pos.clamp(0, total <= 0 ? 1 : total),
                      onChangeStart: (v) {
                        _hideTimer?.cancel();
                        setState(() {
                          _scrubbing = true;
                          _scrubTo = v;
                        });
                      },
                      onChanged: (v) => setState(() => _scrubTo = v),
                      onChangeEnd: (v) async {
                        await widget.player.seek(Duration(milliseconds: v.round()));
                        if (!mounted) return;
                        setState(() => _scrubbing = false);
                        _scheduleHide();
                      },
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 4, right: 4, bottom: 2),
              child: Row(
                children: [
                  Text(
                    '${_fmt(Duration(milliseconds: pos.round()))}  /  ${_fmt(_duration)}',
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 12,
                        fontWeight: FontWeight.w500),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: () {
                      _showControls();
                      widget.onToggleFullscreen();
                    },
                    child: Icon(
                      widget.isFullscreen
                          ? Icons.fullscreen_exit_rounded
                          : Icons.fullscreen_rounded,
                      color: Colors.white,
                      size: 26,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openSpeedSheet() async {
    const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    final picked = await _sheet<double>(
      title: 'Playback speed',
      items: speeds,
      selected: _speed,
      labelOf: (s) => s == 1.0 ? 'Normal' : '${s}x',
    );
    if (picked == null) return;
    await widget.player.setRate(picked);
    if (mounted) setState(() => _speed = picked);
  }

  Future<void> _openQualitySheet() async {
    final picked = await _sheet<VideoQuality>(
      title: 'Quality',
      items: widget.qualities,
      selected: widget.qualities.firstWhere(
        (q) => q.label == widget.currentQuality,
        orElse: () => widget.qualities.first,
      ),
      labelOf: (q) => q.label,
    );
    if (picked != null && picked.label != widget.currentQuality) {
      widget.onQualityChanged(picked);
    }
  }

  Future<T?> _sheet<T>({
    required String title,
    required List<T> items,
    required T selected,
    required String Function(T) labelOf,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      backgroundColor: Brand.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(title,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
              ),
            ),
            ...items.map((it) {
              final isSel = labelOf(it) == labelOf(selected);
              return ListTile(
                dense: true,
                title: Text(labelOf(it),
                    style: TextStyle(
                        color: isSel ? Brand.blue : Colors.white70,
                        fontWeight: isSel ? FontWeight.w700 : FontWeight.w500)),
                trailing: isSel ? const Icon(Icons.check, color: Brand.blue, size: 20) : null,
                onTap: () => Navigator.pop(ctx, it),
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

/// The translucent arc + "10 seconds" badge shown on a double-tap seek.
class _SeekRipple extends StatelessWidget {
  final int side;
  final int seconds;
  const _SeekRipple({required this.side, required this.seconds});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: side < 0 ? Alignment.centerLeft : Alignment.centerRight,
      child: FractionallySizedBox(
        widthFactor: 0.42,
        child: TweenAnimationBuilder<double>(
          key: ValueKey('$side-$seconds'),
          tween: Tween(begin: 0.9, end: 0.0),
          duration: const Duration(milliseconds: 700),
          builder: (_, v, child) => Opacity(opacity: v, child: child),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.horizontal(
                left: side < 0 ? Radius.zero : const Radius.circular(500),
                right: side < 0 ? const Radius.circular(500) : Radius.zero,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(side < 0 ? Icons.fast_rewind_rounded : Icons.fast_forward_rounded,
                    color: Colors.white, size: 30),
                const SizedBox(height: 4),
                Text('$seconds seconds',
                    style: const TextStyle(
                        color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
