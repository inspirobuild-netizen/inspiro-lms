import 'dart:async';

import 'package:media_kit/media_kit.dart' hide PlayerState;
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

/// What the on-screen controls need from a video engine.
///
/// The app plays lessons from two sources — uploaded files through media_kit,
/// and linked videos through an embedded player — and a student should not be
/// able to tell which they are watching. Rather than maintain a second, poorer
/// set of controls for the linked case, both engines implement this interface
/// and the same PlayerControls widget drives either one.
abstract class LessonPlayback {
  Stream<Duration> get positionStream;
  Stream<Duration> get durationStream;
  Stream<Duration> get bufferStream;
  Stream<bool> get playingStream;
  Stream<bool> get bufferingStream;

  Duration get position;
  Duration get duration;
  bool get playing;

  Future<void> playOrPause();
  Future<void> seek(Duration to);
  Future<void> setRate(double rate);

  void dispose();
}

/// Uploaded video. media_kit already exposes everything as streams, so this is
/// a thin pass-through.
class MediaKitPlayback implements LessonPlayback {
  final Player player;
  MediaKitPlayback(this.player);

  @override
  Stream<Duration> get positionStream => player.stream.position;
  @override
  Stream<Duration> get durationStream => player.stream.duration;
  @override
  Stream<Duration> get bufferStream => player.stream.buffer;
  @override
  Stream<bool> get playingStream => player.stream.playing;
  @override
  Stream<bool> get bufferingStream => player.stream.buffering;

  @override
  Duration get position => player.state.position;
  @override
  Duration get duration => player.state.duration;
  @override
  bool get playing => player.state.playing;

  @override
  Future<void> playOrPause() => player.playOrPause();
  @override
  Future<void> seek(Duration to) => player.seek(to);
  @override
  Future<void> setRate(double rate) => player.setRate(rate);

  @override
  void dispose() {}
}

/// Linked video. The embedded player reports position only when polled, so a
/// ticker turns it into the same streams the controls already consume — which
/// is what lets the linked case reuse the full control set: scrub bar,
/// buffering, speed, double-tap seek, auto-hide.
class YouTubePlayback implements LessonPlayback {
  final YoutubePlayerController controller;

  final _position = StreamController<Duration>.broadcast();
  final _duration = StreamController<Duration>.broadcast();
  final _buffer = StreamController<Duration>.broadcast();
  final _playing = StreamController<bool>.broadcast();
  final _buffering = StreamController<bool>.broadcast();

  Duration _pos = Duration.zero;
  Duration _dur = Duration.zero;
  bool _isPlaying = false;
  Timer? _ticker;

  YouTubePlayback(this.controller) {
    controller.listen((value) {
      final playing = value.playerState == PlayerState.playing;
      if (playing != _isPlaying) {
        _isPlaying = playing;
        _playing.add(playing);
      }
      _buffering.add(value.playerState == PlayerState.buffering);
    });

    // Twice a second keeps the scrub bar as smooth as the uploaded-video one
    // without hammering the embedded player.
    _ticker = Timer.periodic(const Duration(milliseconds: 500), (_) async {
      try {
        final t = await controller.currentTime;
        final d = await controller.duration;
        final loaded = await controller.videoLoadedFraction;
        _pos = Duration(milliseconds: (t * 1000).round());
        _position.add(_pos);
        if (d > 0) {
          _dur = Duration(milliseconds: (d * 1000).round());
          _duration.add(_dur);
          _buffer.add(Duration(milliseconds: (d * loaded * 1000).round()));
        }
      } catch (_) {
        // The embedded player is not ready yet; the next tick will do.
      }
    });
  }

  @override
  Stream<Duration> get positionStream => _position.stream;
  @override
  Stream<Duration> get durationStream => _duration.stream;
  @override
  Stream<Duration> get bufferStream => _buffer.stream;
  @override
  Stream<bool> get playingStream => _playing.stream;
  @override
  Stream<bool> get bufferingStream => _buffering.stream;

  @override
  Duration get position => _pos;
  @override
  Duration get duration => _dur;
  @override
  bool get playing => _isPlaying;

  @override
  Future<void> playOrPause() async {
    if (_isPlaying) {
      controller.pauseVideo();
    } else {
      controller.playVideo();
    }
  }

  @override
  Future<void> seek(Duration to) async {
    controller.seekTo(seconds: to.inMilliseconds / 1000, allowSeekAhead: true);
    _pos = to;
    _position.add(to);
  }

  @override
  Future<void> setRate(double rate) async => controller.setPlaybackRate(rate);

  @override
  void dispose() {
    _ticker?.cancel();
    _position.close();
    _duration.close();
    _buffer.close();
    _playing.close();
    _buffering.close();
  }
}
