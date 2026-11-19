// Lesson video on a real build in the iOS Simulator: times HLS against MP4 on
// the same class, then drives the real player screen through HLS, resume, a
// quality switch and the fall-back to MP4 — against a fake API, so no account
// or enrolment is involved.
//
// Not part of CI: the links are short-lived signed URLs. Make them with
// apps/api/scripts/check-video-hls.mjs on the server (it writes one playlist
// per rendition plus a signed 480p MP4 link), serve the playlists locally,
// then run:
//
//   cd <dir with the playlists> && python3 -m http.server 8765 --bind 127.0.0.1
//   FLUTTER_SWIFT_PACKAGE_MANAGER=false flutter test integration_test/video_playback_test.dart \
//     -d <simulator> --dart-define=HLS_BASE=http://127.0.0.1:8765 \
//     --dart-define=MP4_480="$(cat mp4-480p.txt)"
//
// Results print as `VIDEO|` lines.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import 'package:inspiro_mobile/core/api/api_client.dart';
import 'package:inspiro_mobile/features/learn/screens/video_player_screen.dart';
import 'package:inspiro_mobile/features/learn/widgets/player_controls.dart';

const _hlsBase = String.fromEnvironment('HLS_BASE');
const _mp4 = String.fromEnvironment('MP4_480');

void _report(String step, String detail) => debugPrint('VIDEO|$step|$detail');

/// Answers the two calls the player screen makes: watch-url and progress.
class _FakeApi implements HttpClientAdapter {
  _FakeApi(this.watchUrl);
  final Map<String, dynamic> Function(String format) watchUrl;
  final requests = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    requests.add('${o.method} ${o.uri.path}${o.uri.hasQuery ? '?${o.uri.query}' : ''}');
    final Object data = o.uri.path.endsWith('/watch-url')
        ? watchUrl(o.uri.queryParameters['format'] ?? '')
        : <String, dynamic>{};
    return ResponseBody.fromString(jsonEncode({'success': true, 'data': data}), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

/// What the API answers for an HLS request: 480p first, as the server orders it.
Map<String, dynamic> _hlsAnswer({String first = '480p', int resume = 0}) {
  final qualities = [
    for (final r in ['480p', '720p', '360p', '240p'])
      {'label': r, 'url': '$_hlsBase/${r == '480p' ? first : r}.m3u8'},
  ];
  return {
    'type': 'video', 'provider': 'bunny', 'format': 'hls',
    'url': qualities.first['url'], 'qualities': qualities,
    'resumeSeconds': resume, 'expiresIn': 21600,
  };
}

Map<String, dynamic> _mp4Answer() => {
      'type': 'video', 'provider': 'bunny', 'format': 'mp4', 'url': _mp4,
      'qualities': [{'label': '480p', 'url': _mp4}],
      'resumeSeconds': 0, 'expiresIn': 7200,
    };

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    MediaKit.ensureInitialized();
    await ApiClient.init();
  });

  Future<bool> pumpUntil(WidgetTester tester, bool Function() ok,
      {Duration timeout = const Duration(seconds: 60)}) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      if (ok()) return true;
      await tester.pump(const Duration(milliseconds: 100));
    }
    return ok();
  }

  /// Opens [url] in a bare player rendered by the app's own Video widget, and
  /// times the first frame and a seek into the middle of the class.
  Future<void> timePlayback(WidgetTester tester, String name, String url) async {
    final player = Player();
    final controller = VideoController(player);
    final errors = <String>[];
    final errorSub = player.stream.error.listen(errors.add);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Video(controller: controller))));

    var rendered = false;
    unawaited(controller.waitUntilFirstFrameRendered.then((_) => rendered = true));
    final sw = Stopwatch()..start();
    await player.open(Media(url));
    final firstFrame = await pumpUntil(tester, () => rendered && player.state.position > Duration.zero)
        ? sw.elapsedMilliseconds
        : null;

    int? seek;
    if (firstFrame != null) {
      const target = Duration(minutes: 18);
      final sw2 = Stopwatch()..start();
      await player.seek(target);
      if (await pumpUntil(tester, () => player.state.position >= target + const Duration(seconds: 1))) {
        seek = sw2.elapsedMilliseconds;
      }
    }
    _report(name, 'first frame ${firstFrame ?? 'NEVER'} ms · seek to 18:00 and play ${seek ?? 'NEVER'} ms · '
        'length ${player.state.duration.inSeconds} s · errors ${errors.isEmpty ? 'none' : errors.join(' / ')}');
    await errorSub.cancel();
    await tester.pumpWidget(const SizedBox());
    await player.dispose();
    expect(firstFrame, isNotNull, reason: '$name never showed a frame: $errors');
    expect(seek, isNotNull, reason: '$name could not seek');
  }

  testWidgets('a refused playlist reads as an open failure, and only that does', (tester) async {
    final player = Player();
    final errors = <String>[];
    final sub = player.stream.error.listen(errors.add);
    await player.open(Media('$_hlsBase/missing.m3u8'));
    await pumpUntil(tester, () => errors.any(isMediaOpenFailure), timeout: const Duration(seconds: 20));
    _report('refused-playlist', errors.join(' / '));
    await sub.cancel();
    await player.dispose();
    expect(errors.where(isMediaOpenFailure), isNotEmpty, reason: 'mpv said: $errors');
    expect(isMediaOpenFailure('Could not open/initialize audio device -> no sound.'), isFalse);
    expect(isMediaOpenFailure('tcp: Connection to tcp://cdn:443 failed: Operation timed out'), isFalse);
  });

  testWidgets('HLS 480p: first frame and seek', (tester) => timePlayback(tester, 'hls-480p', '$_hlsBase/480p.m3u8'));
  testWidgets('MP4 480p: first frame and seek', (tester) => timePlayback(tester, 'mp4-480p', _mp4));
  testWidgets('HLS 720p: first frame and seek', (tester) => timePlayback(tester, 'hls-720p', '$_hlsBase/720p.m3u8'));

  PlayerControls controls(WidgetTester tester) => tester.widget<PlayerControls>(find.byType(PlayerControls));
  bool playing(WidgetTester tester) =>
      find.byType(PlayerControls).evaluate().isNotEmpty && controls(tester).player.position > Duration.zero;

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('player screen: asks for HLS, opens at 480p, menu best-first, switch keeps position', (tester) async {
    final api = _FakeApi((format) => format == 'hls' ? _hlsAnswer() : _mp4Answer());
    ApiClient.dio.httpClientAdapter = api;
    final sw = Stopwatch()..start();
    await tester.pumpWidget(const MaterialApp(home: VideoPlayerScreen(lessonId: 'L1', title: 'Introduction')));
    expect(await pumpUntil(tester, () => playing(tester)), isTrue, reason: 'never started');
    _report('screen-hls', 'playing after ${sw.elapsedMilliseconds} ms; requests ${api.requests}');

    expect(api.requests.first, 'GET /api/v1/lessons/L1/watch-url?format=hls');
    expect(controls(tester).currentQuality, '480p');
    expect(controls(tester).qualities.map((q) => q.label), ['720p', '480p', '360p', '240p']);

    await tester.pump(const Duration(seconds: 3));
    final before = controls(tester).player.position;
    controls(tester).onQualityChanged(controls(tester).qualities.first);
    final switched = await pumpUntil(tester,
        () => controls(tester).currentQuality == '720p' && controls(tester).player.position > before + const Duration(milliseconds: 500));
    _report('screen-switch', '720p ${switched ? 'continued' : 'FAILED'} from ${before.inMilliseconds} ms to ${controls(tester).player.position.inMilliseconds} ms');
    expect(switched, isTrue);
    await leave(tester);
  });

  testWidgets('player screen: resumes at 10:00 over HLS', (tester) async {
    ApiClient.dio.httpClientAdapter = _FakeApi((format) => _hlsAnswer(resume: 600));
    await tester.pumpWidget(const MaterialApp(home: VideoPlayerScreen(lessonId: 'L2', title: 'Resume')));
    final ok = await pumpUntil(tester, () => playing(tester) && controls(tester).player.position >= const Duration(seconds: 600));
    _report('screen-resume', ok ? 'resumed at ${controls(tester).player.position.inSeconds} s' : 'FAILED at ${playing(tester) ? controls(tester).player.position : 'not playing'}');
    expect(ok, isTrue);
    await leave(tester);
  });

  testWidgets('player screen: falls back to MP4 when the HLS playlist is refused', (tester) async {
    final api = _FakeApi((format) => format == 'hls' ? _hlsAnswer(first: 'missing') : _mp4Answer());
    ApiClient.dio.httpClientAdapter = api;
    final sw = Stopwatch()..start();
    await tester.pumpWidget(const MaterialApp(home: VideoPlayerScreen(lessonId: 'L3', title: 'Fallback')));
    final ok = await pumpUntil(tester, () => playing(tester));
    _report('screen-fallback', '${ok ? 'playing MP4' : 'FAILED'} after ${sw.elapsedMilliseconds} ms; requests ${api.requests}');
    expect(ok, isTrue);
    expect(api.requests.where((r) => r.contains('/watch-url')), [
      'GET /api/v1/lessons/L3/watch-url?format=hls',
      'GET /api/v1/lessons/L3/watch-url?format=mp4',
    ]);
    await leave(tester);
  });

  testWidgets('player screen: after a fallback, the next class asks for MP4 straight away', (tester) async {
    final api = _FakeApi((format) => format == 'hls' ? _hlsAnswer() : _mp4Answer());
    ApiClient.dio.httpClientAdapter = api;
    await tester.pumpWidget(const MaterialApp(home: VideoPlayerScreen(lessonId: 'L4', title: 'Next class')));
    expect(await pumpUntil(tester, () => playing(tester)), isTrue);
    expect(api.requests.first, 'GET /api/v1/lessons/L4/watch-url?format=mp4');
    _report('screen-sticky', 'next class asked ${api.requests.first}');
    await leave(tester);
  });
}
