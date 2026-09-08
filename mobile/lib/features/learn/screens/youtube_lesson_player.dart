import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../../../core/theme/brand.dart';

/// Playback for a lesson whose video is hosted on YouTube rather than uploaded.
///
/// The academy's requirement is that a student never perceives this as a
/// YouTube video. That is achieved by hiding YouTube's own chrome — the
/// player runs with `controls: false`, so its control bar and the logo inside
/// it are never drawn — and rendering the app's controls over the top,
/// driving playback through the player's documented commands.
///
/// Deliberately NOT done: resolving or proxying the underlying media stream to
/// feed a native player. It would look identical to a student, and it would
/// break the terms the videos are served under. Those stream URLs are also
/// short-lived and address-bound, so a player built on them fails in the field
/// even when it works on a desk. Every class would go dark at once — an
/// unacceptable risk for paid content.
///
/// Residual traces of the source, worth knowing rather than discovering: a
/// long-press can raise the webview's own context menu (suppressed below), and
/// full-screen is handled in-app rather than handed over.
class YouTubeLessonPlayer extends StatefulWidget {
  final String videoId;
  final String title;
  final Duration startAt;

  /// Reports playback position so the lesson's progress is recorded exactly as
  /// it is for an uploaded video — the student sees no difference in resume,
  /// completion or streak behaviour.
  final void Function(Duration position, Duration total)? onProgress;

  const YouTubeLessonPlayer({
    super.key,
    required this.videoId,
    required this.title,
    this.startAt = Duration.zero,
    this.onProgress,
  });

  @override
  State<YouTubeLessonPlayer> createState() => _YouTubeLessonPlayerState();
}

class _YouTubeLessonPlayerState extends State<YouTubeLessonPlayer> {
  late final YoutubePlayerController _controller;
  Timer? _ticker;
  Timer? _hideControls;

  bool _ready = false;
  bool _playing = false;
  bool _controlsVisible = true;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      startSeconds: widget.startAt.inSeconds.toDouble(),
      autoPlay: false,
      params: const YoutubePlayerParams(
        // The whole point: no native control bar, so no logo and no
        // "Watch on YouTube" affordance. The app draws its own controls.
        showControls: false,
        showFullscreenButton: false,
        showVideoAnnotations: false,
        // Keeps playback inside the app rather than handing off to the
        // YouTube app on iOS.
        playsInline: true,
        enableCaption: false,
        // Suggested videos at the end are the loudest branding leak there is.
        strictRelatedVideos: true,
      ),
    );

    _controller.listen((value) {
      if (!mounted) return;
      final playing = value.playerState == PlayerState.playing;
      if (playing != _playing) setState(() => _playing = playing);
      if (!_ready && value.playerState != PlayerState.unknown) {
        setState(() => _ready = true);
      }
    });

    _ticker = Timer.periodic(const Duration(seconds: 1), (_) async {
      if (!mounted) return;
      final pos = await _controller.currentTime;
      final dur = await _controller.duration;
      if (!mounted) return;
      setState(() {
        _position = Duration(seconds: pos.toInt());
        if (dur > 0) _duration = Duration(seconds: dur.toInt());
      });
      if (_playing) widget.onProgress?.call(_position, _duration);
    });

    _scheduleHide();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _hideControls?.cancel();
    _controller.close();
    super.dispose();
  }

  void _scheduleHide() {
    _hideControls?.cancel();
    _hideControls = Timer(const Duration(seconds: 3), () {
      if (mounted && _playing) setState(() => _controlsVisible = false);
    });
  }

  void _showControls() {
    setState(() => _controlsVisible = true);
    _scheduleHide();
  }

  void _togglePlay() {
    if (_playing) {
      _controller.pauseVideo();
    } else {
      _controller.playVideo();
    }
    _showControls();
  }

  void _skip(int seconds) {
    final target = _position + Duration(seconds: seconds);
    final clamped = target < Duration.zero
        ? Duration.zero
        : (_duration > Duration.zero && target > _duration ? _duration : target);
    _controller.seekTo(seconds: clamped.inSeconds.toDouble(), allowSeekAhead: true);
    setState(() => _position = clamped);
    _showControls();
  }

  static String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return d.inHours > 0 ? '${d.inHours}:$m:$s' : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // The player itself is never touched directly: an absorber sits
            // over it so taps reach our controls, and a long-press cannot
            // raise the webview's own menu.
            YoutubePlayer(
              controller: _controller,
              aspectRatio: 16 / 9,
              gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{},
            ),

            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _controlsVisible ? setState(() => _controlsVisible = false) : _showControls(),
                onDoubleTap: _togglePlay,
                onLongPress: () {}, // swallow, so no context menu appears
                child: const SizedBox.expand(),
              ),
            ),

            if (!_ready)
              const Center(
                child: SizedBox(
                  height: 28,
                  width: 28,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Brand.blue),
                ),
              ),

            AnimatedOpacity(
              opacity: _controlsVisible ? 1 : 0,
              duration: const Duration(milliseconds: 180),
              child: IgnorePointer(
                ignoring: !_controlsVisible,
                child: _Controls(
                  playing: _playing,
                  position: _position,
                  duration: _duration,
                  onTogglePlay: _togglePlay,
                  onSkip: _skip,
                  onSeek: (v) {
                    _controller.seekTo(seconds: v, allowSeekAhead: true);
                    setState(() => _position = Duration(seconds: v.toInt()));
                    _showControls();
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Controls extends StatelessWidget {
  final bool playing;
  final Duration position;
  final Duration duration;
  final VoidCallback onTogglePlay;
  final void Function(int) onSkip;
  final void Function(double) onSeek;

  const _Controls({
    required this.playing,
    required this.position,
    required this.duration,
    required this.onTogglePlay,
    required this.onSkip,
    required this.onSeek,
  });

  @override
  Widget build(BuildContext context) {
    final total = duration.inSeconds.toDouble();
    final at = position.inSeconds.toDouble().clamp(0, total <= 0 ? 0 : total).toDouble();

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x66000000), Colors.transparent, Color(0xAA000000)],
          stops: [0, 0.45, 1],
        ),
      ),
      child: Stack(
        children: [
          Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _RoundButton(icon: Icons.replay_10, onTap: () => onSkip(-10)),
                const SizedBox(width: 26),
                _RoundButton(
                  icon: playing ? Icons.pause : Icons.play_arrow,
                  large: true,
                  onTap: onTogglePlay,
                ),
                const SizedBox(width: 26),
                _RoundButton(icon: Icons.forward_10, onTap: () => onSkip(10)),
              ],
            ),
          ),
          Positioned(
            left: 8,
            right: 8,
            bottom: 4,
            child: Row(
              children: [
                Text(_YouTubeLessonPlayerState._fmt(position),
                    style: const TextStyle(color: Colors.white70, fontSize: 11)),
                Expanded(
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 2.5,
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                      overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                      activeTrackColor: Brand.blue,
                      inactiveTrackColor: Colors.white24,
                      thumbColor: Brand.blue,
                    ),
                    child: Slider(
                      value: at,
                      max: total <= 0 ? 1 : total,
                      onChanged: total <= 0 ? null : onSeek,
                    ),
                  ),
                ),
                Text(_YouTubeLessonPlayerState._fmt(duration),
                    style: const TextStyle(color: Colors.white70, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool large;
  const _RoundButton({required this.icon, required this.onTap, this.large = false});

  @override
  Widget build(BuildContext context) {
    final size = large ? 58.0 : 42.0;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: size,
        width: size,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.42),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24),
        ),
        child: Icon(icon, color: Colors.white, size: large ? 32 : 22),
      ),
    );
  }
}
