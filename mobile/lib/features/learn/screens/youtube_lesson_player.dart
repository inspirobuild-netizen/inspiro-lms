import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import 'package:flutter/services.dart';

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
  late final YouTubePlayback _playback;
  bool _ready = false;
  bool _fullscreen = false;
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
      if (!mounted || _ready) return;
      if (value.playerState != PlayerState.unknown) setState(() => _ready = true);
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
    if (_fullscreen) {
      SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    super.dispose();
  }

  void _toggleFullscreen() {
    setState(() => _fullscreen = !_fullscreen);
    if (_fullscreen) {
      SystemChrome.setPreferredOrientations(
        [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight],
      );
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // The embedded player takes no gestures of its own, so taps reach
          // our controls and a long-press cannot raise its context menu.
          YoutubePlayer(
            controller: _controller,
            aspectRatio: 16 / 9,
            gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{},
          ),

          if (!_ready)
            const Center(
              child: SizedBox(
                height: 30,
                width: 30,
                child: CircularProgressIndicator(strokeWidth: 2.4, color: Brand.blue),
              ),
            ),

          if (_ready)
            PlayerControls(
              player: _playback,
              title: widget.title,
              // No rendition list: the embedded player picks quality itself,
              // so offering a menu that changes nothing would be a lie.
              qualities: const [],
              currentQuality: '',
              onQualityChanged: (_) {},
              onToggleFullscreen: _toggleFullscreen,
              isFullscreen: _fullscreen,
              onBack: () => Navigator.of(context).maybePop(),
            ),
        ],
      ),
    );
  }
}
