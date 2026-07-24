import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/app_ui.dart';

/// Plays a lesson's video via a short-lived signed Bunny Stream HLS URL,
/// fetched fresh on open (never cached — the signature expires).
class VideoPlayerScreen extends StatefulWidget {
  final String lessonId;
  final String title;
  const VideoPlayerScreen({super.key, required this.lessonId, required this.title});

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  late final Player _player;
  late final VideoController _controller;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    SystemChrome.setPreferredOrientations(
        [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight, DeviceOrientation.portraitUp]);
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
      final url = data['url'] as String;
      await _player.open(Media(url));
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not load this video. Please check your connection and try again.';
          _loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title, style: const TextStyle(fontSize: 15), overflow: TextOverflow.ellipsis),
      ),
      body: Center(
        child: _error != null
            ? ErrorRetry(message: _error!, onRetry: _load)
            : _loading
                ? const LoadingState()
                : AspectRatio(aspectRatio: 16 / 9, child: Video(controller: _controller)),
      ),
    );
  }
}
