import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';


import '../../../core/theme/brand.dart';
import '../widgets/player_controls.dart';
import '../widgets/lesson_playback.dart';

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

  /// Fired when the student enters or leaves fullscreen, so the screen around
  /// this player can hide its chrome instead of a second Scaffold appearing
  /// inside the first.
  final ValueChanged<bool>? onFullscreenChanged;

  const YouTubeLessonPlayer({
    super.key,
    required this.videoId,
    required this.title,
    this.startAt = Duration.zero,
    this.onProgress,
    this.onFullscreenChanged,
  });

  @override
  State<YouTubeLessonPlayer> createState() => _YouTubeLessonPlayerState();
}

class _YouTubeLessonPlayerState extends State<YouTubeLessonPlayer> {
  late final YoutubePlayerController _controller;
  late final YouTubePlayback _playback;
  bool _ready = false;
  // Until the video is actually rolling, the embed shows ITS OWN poster and a
  // branded play button. Nothing we pass can suppress that, so the app covers
  // it with its own start screen and lifts the cover once playback begins.
  bool _hasStarted = false;
  // Paused is the other moment the embed advertises itself: it draws a panel
  // with the channel, a share/copy link, a related-video thumbnail and the
  // wordmark. No supported parameter turns that off, so the app covers it.
  bool _playing = false;
  // Buffering is NOT one of these: it is not playing either, and covering
  // during a mid-stream stall would flash a panel over a working video.
  bool _showPausePanel = false;
  Timer? _progressTimer;
  Duration _lastReported = Duration.zero;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      startSeconds: widget.startAt.inSeconds.toDouble(),
      autoPlay: false,
      params: const YoutubePlayerParams(
        // No native control bar means no logo and no "Watch on YouTube"
        // affordance — the app draws the same controls it uses for uploaded
        // video, so the two are indistinguishable to a student.
        showControls: false,
        showFullscreenButton: false,
        showVideoAnnotations: false,
        // Keeps playback in the app instead of handing off on iOS.
        playsInline: true,
        enableCaption: false,
        // End-screen suggestions are the loudest branding leak there is.
        strictRelatedVideos: true,
      ),
    );
    _playback = YouTubePlayback(_controller);

    _controller.listen((value) {
      if (!mounted) return;
      if (!_ready && value.playerState != PlayerState.unknown) {
        setState(() => _ready = true);
      }
      final st = value.playerState;
      final playing = st == PlayerState.playing;
      // The embed draws its branded panel when paused, ended or cued — the
      // end screen is the worst of them, being a grid of other people's
      // videos. Buffering is deliberately excluded.
      final covered = st == PlayerState.paused ||
          st == PlayerState.ended ||
          st == PlayerState.cued ||
          st == PlayerState.unStarted;
      if (playing != _playing) setState(() => _playing = playing);
      if (covered != _showPausePanel) setState(() => _showPausePanel = covered);
      if (!_hasStarted && playing) setState(() => _hasStarted = true);
    });

    _progressTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      final pos = _playback.position;
      if (!_playback.playing) return;
      if ((pos - _lastReported).abs() < const Duration(seconds: 5)) return;
      _lastReported = pos;
      widget.onProgress?.call(pos, _playback.duration);
    });
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    _playback.dispose();
    _controller.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Everything the student sees over the video goes through controlsBuilder.
    // On mobile the package renders that inside an overlay portal; anything
    // placed as a plain Stack sibling is composited BEHIND the player surface
    // instead, which is why the covers and controls were invisible and the
    // embed's own paused panel showed through.
    return YoutubePlayer(
      controller: _controller,
      aspectRatio: 16 / 9,
      gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{},
      controlsBuilder: (context, isFullscreen) {
        return Stack(
          fit: StackFit.expand,
          children: [
            // Paused, ended or cued: the embed draws its own panel with the
            // channel, a copy-link and a grid of other videos. Opaque cover,
            // with taps passing through to the controls above.
            if (_hasStarted && _showPausePanel)
              const IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF10162B), Color(0xFF05070F)],
                    ),
                  ),
                  child: SizedBox.expand(),
                ),
              ),

            if (!_hasStarted)
              _StartCover(
                title: widget.title,
                loading: !_ready,
                onPlay: () {
                  _controller.playVideo();
                  setState(() => _hasStarted = true);
                },
              ),

            if (_hasStarted)
              PlayerControls(
                player: _playback,
                title: widget.title,
                // The embed picks its own rendition, so a quality menu that
                // changed nothing would be a lie.
                qualities: const [],
                currentQuality: '',
                onQualityChanged: (_) {},
                onToggleFullscreen: () {
                  // The package owns fullscreen here, so it can keep the
                  // overlay portal aligned with the player surface.
                  _controller.toggleFullScreen();
                  widget.onFullscreenChanged?.call(!isFullscreen);
                },
                isFullscreen: isFullscreen,
                onBack: () {
                  if (isFullscreen) {
                    _controller.exitFullScreen();
                    widget.onFullscreenChanged?.call(false);
                  } else {
                    Navigator.of(context).maybePop();
                  }
                },
              ),
          ],
        );
      },
    );
  }
}

/// The app's own start screen, over the embed until playback begins.
///
/// Without it a student sees the source's poster art and branded play button
/// for as long as the video is unstarted — the moment the origin is most
/// obvious.
class _StartCover extends StatelessWidget {
  final String title;
  final bool loading;
  final VoidCallback onPlay;
  const _StartCover({required this.title, required this.loading, required this.onPlay});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: loading ? null : onPlay,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF10162B), Color(0xFF05070F)],
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: loading
                  ? const SizedBox(
                      height: 30,
                      width: 30,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: Brand.blue),
                    )
                  : Container(
                      height: 64,
                      width: 64,
                      decoration: BoxDecoration(
                        color: Brand.blue,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Brand.blue.withValues(alpha: 0.35),
                            blurRadius: 24,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 40),
                    ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 14,
              child: Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
