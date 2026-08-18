import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../widgets/player_controls.dart';

/// Plays a lesson video from a short-lived signed Bunny URL, fetched fresh on
/// open — the signature expires, so it is never cached.
///
/// The API returns one signed MP4 per rendition rather than an HLS playlist:
/// CDN token authentication cannot protect HLS on a native player, because the
/// master playlist points at relative sub-paths and URL resolution drops the
/// token. MP4 means no adaptive bitrate, so quality is offered manually and we
/// carry the playback position across a switch.
class VideoPlayerScreen extends StatefulWidget {
  final String lessonId;
  final String title;
  const VideoPlayerScreen({super.key, required this.lessonId, required this.title});

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  // Not `final`: a quality switch replaces both. Reopening media on an
  // existing Player leaves it unable to seek at all — verified on device, the
  // skip buttons go dead too — so the only reliable switch is a fresh player.
  late Player _player;
  late VideoController _controller;

  bool _loading = true;
  String? _error;
  bool _fullscreen = false;

  List<VideoQuality> _qualities = const [];
  String _currentQuality = '';

  // Progress is reported to the server on a timer rather than per frame.
  Timer? _progressTimer;
  Duration _lastReported = Duration.zero;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    WakelockPlus.enable();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.dio.get<Map<String, dynamic>>(
        '/api/v1/lessons/${widget.lessonId}/watch-url',
      );
      final data = res.data!['data'] as Map<String, dynamic>;

      final list = (data['qualities'] as List<dynamic>? ?? const [])
          .map((q) => VideoQuality.fromJson(q as Map<String, dynamic>))
          .toList();

      // Older builds of the API returned only `url`; keep working against it.
      final qualities = list.isNotEmpty
          ? list
          : [VideoQuality(label: 'Auto', url: data['url'] as String)];

      final resumeAt = Duration(seconds: (data['resumeSeconds'] as num?)?.toInt() ?? 0);

      await _player.open(Media(qualities.first.url));
      if (resumeAt > const Duration(seconds: 5)) await _seekWhenReady(resumeAt);

      if (!mounted) return;
      setState(() {
        _qualities = qualities;
        _currentQuality = qualities.first.label;
        _loading = false;
      });
      _startProgressReporting();
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not load this video. Check your connection and try again.';
          _loading = false;
        });
      }
    }
  }

  /// Seeks to [to] and keeps trying until the position actually reflects it.
  ///
  /// Only works while the player is PLAYING. mpv drops seeks until the
  /// demuxer has loaded the file, and opening with `play: false` never forces
  /// that load — so seeking on a paused, freshly-opened file is a silent
  /// no-op no matter how long you wait or how often you retry. Callers must
  /// open with `play: true` and pause afterwards if needed.
  ///
  /// There is also no readiness signal worth waiting on: every rendition of a
  /// lesson is the same video and reports the same duration, so a duration
  /// event says nothing about which file is loaded. Hence verify rather than
  /// predict — seek, check, retry. Giving up means starting from the
  /// beginning, which is the behaviour this replaces.
  Future<void> _seekWhenReady(Duration to) async {
    if (to <= Duration.zero) return;
    for (var attempt = 0; attempt < 20; attempt++) {
      await _player.seek(to);
      await Future<void>.delayed(const Duration(milliseconds: 150));
      if (!mounted) return;
      if ((_player.state.position - to).abs() < const Duration(seconds: 2)) return;
    }
  }

  /// Switching rendition means reopening a different file, so the position has
  /// to be carried across by hand or the student is thrown back to the start.
  Future<void> _switchQuality(VideoQuality q) async {
    final at = _player.state.position;
    final wasPlaying = _player.state.playing;
    setState(() => _currentQuality = q.label);

    // play: true so the demuxer actually loads and will accept the seek.
    await _player.open(Media(q.url));
    await _seekWhenReady(at);
    if (!wasPlaying) await _player.pause();
  }

  void _startProgressReporting() {
    _progressTimer?.cancel();
    _progressTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      final pos = _player.state.position;
      if ((pos - _lastReported).abs() < const Duration(seconds: 5)) return;
      _lastReported = pos;
      unawaited(_reportProgress(pos));
    });
  }

  Future<void> _reportProgress(Duration pos) async {
    final dur = _player.state.duration;
    try {
      await ApiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/lessons/${widget.lessonId}/progress',
        data: {
          'watchedSeconds': pos.inSeconds,
          // Treat the last few seconds as finished — almost nobody watches
          // trailing credits, and requiring 100% leaves lessons stuck at 99%.
          'isCompleted': dur.inSeconds > 0 && pos.inSeconds >= dur.inSeconds - 10,
        },
      );
    } catch (_) {
      // Progress is best-effort; never interrupt playback for it.
    }
  }

  void _toggleFullscreen() {
    setState(() => _fullscreen = !_fullscreen);
    if (_fullscreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      SystemChrome.setPreferredOrientations(
          [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    } else {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    }
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    // Fire-and-forget a final position so resume is accurate even when the
    // student leaves between ticks.
    unawaited(_reportProgress(_player.state.position));
    WakelockPlus.disable();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stage = Container(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: _error != null
                ? ErrorRetry(message: _error!, onRetry: _load)
                : _loading
                    ? const LoadingState()
                    : Video(
                        controller: _controller,
                        controls: NoVideoControls,
                        fit: BoxFit.contain,
                      ),
          ),
          if (!_loading && _error == null)
            PlayerControls(
              // Forces a fresh subscription when the player is replaced.
              key: ValueKey(_player),
              player: _player,
              title: widget.title,
              qualities: _qualities,
              currentQuality: _currentQuality,
              onQualityChanged: _switchQuality,
              onToggleFullscreen: _toggleFullscreen,
              isFullscreen: _fullscreen,
              onBack: () {
                if (_fullscreen) {
                  _toggleFullscreen();
                } else {
                  Navigator.of(context).maybePop();
                }
              },
            ),
        ],
      ),
    );

    // Fullscreen: the video owns the whole screen, and the system back button
    // should collapse it rather than leave the lesson.
    if (_fullscreen) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _toggleFullscreen();
        },
        child: Scaffold(backgroundColor: Colors.black, body: stage),
      );
    }

    return Scaffold(
      backgroundColor: Brand.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(aspectRatio: 16 / 9, child: stage),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
              child: Text(
                widget.title,
                style: const TextStyle(
                    color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold, height: 1.3),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 18),
              child: Text(
                'Double-tap either side to skip 10 seconds.',
                style: TextStyle(color: Colors.white38, fontSize: 12.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void unawaited(Future<void> f) {}
