import 'dart:async';

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../core/api/api_client.dart';
import 'youtube_lesson_player.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';
import '../widgets/player_controls.dart';
import '../widgets/lesson_playback.dart';

/// Plays a lesson video from short-lived signed links, fetched fresh on open —
/// the signatures expire, so they are never cached.
///
/// The API offers one link per rendition, as HLS or MP4. HLS is asked for
/// first: it starts after one small playlist and a 4-second segment however
/// long the class is, where an MP4 must first download an index that grows
/// with the class (2.3 MB for 37 minutes at 480p). The playlist comes from our
/// API, which signs every segment — Bunny's own lists them by relative name,
/// and the token does not survive that. If HLS cannot start, the screen falls
/// back to MP4, the proven path. Neither gives adaptive bitrate on this player,
/// so quality is offered manually and the position is carried across a switch.
/// Whether a media_kit error means the media itself could not be opened.
///
/// The error stream carries more than that: "Could not open/initialize audio
/// device" (the iOS Simulator has none) and `tcp:` connection failures that
/// ffmpeg goes on to retry. Falling back on those would abandon a stream that
/// was about to play, so only a failed open counts.
bool isMediaOpenFailure(String message) =>
    message.startsWith('Failed to open') || message.contains('Failed to recognize file format');

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

  // Once HLS has failed to start on this device, every later class goes
  // straight to MP4 rather than making the student wait for HLS to fail again.
  static bool _hlsFailedThisSession = false;
  String _format = _hlsFailedThisSession ? 'mp4' : 'hls';
  // Set by the first real playback position. A failure before that means the
  // format never opened; after it, it is an ordinary network hiccup.
  bool _started = false;
  StreamSubscription<Duration>? _startWatch;
  StreamSubscription<String>? _errorWatch;
  Timer? _startTimeout;
  // Each _load bumps this, so a superseded load (HLS that was abandoned for
  // MP4 mid-open) cannot overwrite the state of the one that replaced it.
  int _loadGeneration = 0;

  // Set when the class is hosted externally rather than uploaded. The student
  // is shown the same controls either way; only the engine differs.
  String? _youtubeId;
  Duration _youtubeStartAt = Duration.zero;
  // Mirrors the embedded player's own fullscreen state, so the app bar can get
  // out of the way rather than framing a fullscreen video.
  bool _ytFullscreen = false;

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
    final generation = ++_loadGeneration;
    _stopStartupWatch();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.dio.get<Map<String, dynamic>>(
        '/api/v1/lessons/${widget.lessonId}/watch-url',
        queryParameters: {'format': _format},
      );
      if (generation != _loadGeneration) return;
      final data = res.data!['data'] as Map<String, dynamic>;

      // Externally hosted class: no signed URL to open, so hand off to the
      // embedded player and skip the media_kit path entirely.
      if (data['provider'] == 'youtube') {
        if (!mounted) return;
        setState(() {
          _youtubeId = data['youtubeVideoId'] as String;
          _youtubeStartAt = Duration(seconds: (data['resumeSeconds'] as num?)?.toInt() ?? 0);
          _loading = false;
        });
        return;
      }

      final list = (data['qualities'] as List<dynamic>? ?? const [])
          .map((q) => VideoQuality.fromJson(q as Map<String, dynamic>))
          .toList();

      // Older builds of the API returned only `url`; keep working against it.
      final qualities = list.isNotEmpty
          ? list
          : [VideoQuality(label: 'Auto', url: data['url'] as String)];

      final resumeAt = Duration(seconds: (data['resumeSeconds'] as num?)?.toInt() ?? 0);

      // An older API ignores the format request and answers with MP4 links and
      // no `format` field; only real HLS links get the fallback watch.
      if (data['format'] == 'hls') _watchStartup();
      await _player.open(Media(qualities.first.url));
      // A fallback may have replaced the player while this open was running.
      if (!mounted || generation != _loadGeneration) return;
      if (resumeAt > const Duration(seconds: 5)) await _seekWhenReady(resumeAt);

      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        // The menu lists best first; the server's first entry is still the one
        // that opens, since it picks the starting rendition.
        _qualities = [...qualities]..sort((a, b) => _height(b.label).compareTo(_height(a.label)));
        _currentQuality = qualities.first.label;
        _loading = false;
      });
      _startProgressReporting();
    } on DioException catch (e) {
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _error = _loadFailureMessage(e);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted && generation == _loadGeneration) {
        setState(() {
          // Naming the failure beats a blanket "check your connection", which
          // sent staff hunting a network fault when the real answer was that
          // the video had not finished encoding yet.
          _error = 'This class could not be opened. $e';
          _loading = false;
        });
      }
    }
  }

  static int _height(String label) => int.tryParse(label.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  /// Falls back to MP4 if HLS has not produced playback when it fails.
  ///
  /// mpv reports a refused or unreadable playlist as an error, which media_kit
  /// passes on. A refused segment is only a warning, so a playlist that opens
  /// with segments that never arrive would hang silently; the timeout covers
  /// that, and stands down while media is still arriving, so a slow network
  /// is not mistaken for a broken format.
  void _watchStartup() {
    _started = false;
    _startWatch = _player.stream.position.listen((p) {
      if (p > Duration.zero) {
        _started = true;
        _stopStartupWatch();
      }
    });
    _errorWatch = _player.stream.error.listen((message) {
      if (isMediaOpenFailure(message)) _fallBackToMp4('error: $message');
    });
    _startTimeout = Timer(const Duration(seconds: 20), () {
      if (_player.state.buffer > Duration.zero) return;
      _fallBackToMp4('no media after 20 s');
    });
  }

  void _stopStartupWatch() {
    _startWatch?.cancel();
    _errorWatch?.cancel();
    _startTimeout?.cancel();
    _startWatch = null;
    _errorWatch = null;
    _startTimeout = null;
  }

  void _fallBackToMp4(String reason) {
    if (_started || _format != 'hls' || !mounted) return;
    debugPrint('HLS did not start ($reason); falling back to MP4');
    _hlsFailedThisSession = true;
    _format = 'mp4';
    // MP4 goes on a fresh player. Reopening the one whose HLS open was still
    // in flight left it loaded but never playing (seen in the Simulator), the
    // same family of trouble as the stuck seeks noted above.
    final failed = _player;
    setState(() {
      _player = Player();
      _controller = VideoController(_player);
    });
    unawaited(failed.dispose());
    unawaited(_load());
  }

  /// Turns the server's refusal into something the student can act on.
  ///
  /// The old catch-all blamed the connection for everything, including a video
  /// still being processed — which reads as a bug in the app when it is simply
  /// a video that is not ready yet.
  String _loadFailureMessage(DioException e) {
    final data = e.response?.data;
    final err = data is Map ? data['error'] : null;
    final code = err is Map ? err['code'] as String? : null;
    final serverMessage = err is Map ? err['message'] as String? : null;

    switch (code) {
      case 'VIDEO_NOT_READY':
        return 'This class is still being prepared. It is usually ready within a few '
            'minutes of upload — tap retry shortly.';
      case 'NO_MEDIA':
        return 'No video has been added to this class yet. Your coordinator has been '
            'able to see this too.';
      case 'FORBIDDEN':
      case 'NOT_ENROLLED':
        return serverMessage ?? 'You do not have access to this class yet.';
    }

    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    return serverMessage ?? 'This class could not be opened. Please try again.';
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

  Future<void> _reportProgress(Duration pos, [Duration? total]) async {
    final dur = total ?? _player.state.duration;
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
    _stopStartupWatch();
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
    if (_youtubeId != null) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: _ytFullscreen
            ? null
            : AppBar(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                title: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
        body: Center(
          child: YouTubeLessonPlayer(
            videoId: _youtubeId!,
            title: widget.title,
            startAt: _youtubeStartAt,
            onFullscreenChanged: (v) => setState(() => _ytFullscreen = v),
            // Same 10-second throttle as uploaded video, so resume, completion
            // and streaks behave identically whichever source a class uses.
            onProgress: (pos, total) {
              if ((pos - _lastReported).abs() < const Duration(seconds: 10)) return;
              _lastReported = pos;
              unawaited(_reportProgress(pos, total));
            },
          ),
        ),
      );
    }

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
              player: MediaKitPlayback(_player),
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
