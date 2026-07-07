import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../models/live_class.dart';

class LiveViewerScreen extends StatefulWidget {
  final JoinLiveClassResult joinResult;

  const LiveViewerScreen({super.key, required this.joinResult});

  @override
  State<LiveViewerScreen> createState() => _LiveViewerScreenState();
}

class _LiveViewerScreenState extends State<LiveViewerScreen>
    with WidgetsBindingObserver {
  late final RtcEngine _engine;
  bool _engineReady = false;
  bool _remoteVideoAvailable = false;
  int? _remoteUid;
  String? _errorMessage;
  bool _isMuted = false;

  // Audience can toggle between audio-only and video modes
  bool _showVideo = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Keep screen on during class
    WakelockPlus.enable();
    _initAgora();
  }

  Future<void> _initAgora() async {
    // Request microphone (needed even for audience in some Agora versions)
    await [Permission.microphone].request();

    try {
      _engine = createAgoraRtcEngine();
      await _engine.initialize(RtcEngineContext(
        appId: widget.joinResult.agoraAppId,
        channelProfile: ChannelProfileType.channelProfileLiveBroadcasting,
      ));

      _engine.registerEventHandler(RtcEngineEventHandler(
        onError: (err, msg) {
          setState(() => _errorMessage = 'Agora error $err: $msg');
        },
        onUserJoined: (conn, uid, elapsed) {
          setState(() => _remoteUid = uid);
        },
        onUserOffline: (conn, uid, reason) {
          if (uid == _remoteUid) {
            setState(() {
              _remoteUid = null;
              _remoteVideoAvailable = false;
            });
          }
        },
        onRemoteVideoStateChanged: (conn, uid, state, reason, elapsed) {
          if (uid == _remoteUid) {
            setState(() {
              _remoteVideoAvailable =
                  state == RemoteVideoState.remoteVideoStateDecoding ||
                      state == RemoteVideoState.remoteVideoStateStarting;
            });
          }
        },
        onJoinChannelSuccess: (conn, elapsed) {
          setState(() => _engineReady = true);
        },
      ));

      // Audience role â€” receive only
      await _engine.setClientRole(role: ClientRoleType.clientRoleAudience);
      await _engine.enableVideo();
      await _engine.startPreview();

      await _engine.joinChannel(
        token: widget.joinResult.agoraToken,
        channelId: widget.joinResult.channelName,
        uid: widget.joinResult.agoraUid,
        options: const ChannelMediaOptions(
          clientRoleType: ClientRoleType.clientRoleAudience,
          channelProfile: ChannelProfileType.channelProfileLiveBroadcasting,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        ),
      );
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    }
  }

  Future<void> _leave() async {
    await _engine.leaveChannel();
    await _engine.release();
    WakelockPlus.disable();
    if (mounted) Navigator.of(context).pop();
  }

  void _toggleMute() async {
    _isMuted = !_isMuted;
    await _engine.muteAllRemoteAudioStreams(_isMuted);
    setState(() {});
  }

  void _toggleVideo() => setState(() => _showVideo = !_showVideo);

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable();
    _engine.leaveChannel();
    _engine.release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Force landscape for live class
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);

    return PopScope(
      onPopInvokedWithResult: (_, __) => _leave(),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            // â”€â”€ Remote video â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (_remoteUid != null && _remoteVideoAvailable && _showVideo)
              AgoraVideoView(
                controller: VideoViewController.remote(
                  rtcEngine: _engine,
                  canvas: VideoCanvas(uid: _remoteUid),
                  connection: RtcConnection(
                      channelId: widget.joinResult.channelName),
                ),
              )
            else
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _remoteUid == null
                          ? Icons.videocam_off_outlined
                          : Icons.videocam_outlined,
                      color: Colors.white38,
                      size: 48,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _remoteUid == null
                          ? 'Waiting for instructorâ€¦'
                          : 'Video paused',
                      style: const TextStyle(color: Colors.white38, fontSize: 14),
                    ),
                  ],
                ),
              ),

            // â”€â”€ Error overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (_errorMessage != null)
              Center(
                child: Container(
                  margin: const EdgeInsets.all(24),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.8),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(_errorMessage!,
                      style: const TextStyle(color: Colors.white, fontSize: 13)),
                ),
              ),

            // â”€â”€ Top bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.black.withValues(alpha: 0.8), Colors.transparent],
                  ),
                ),
                child: Row(
                  children: [
                    // Live badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE11D48),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.circle, color: Colors.white, size: 7),
                          SizedBox(width: 5),
                          Text('LIVE',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.8)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        widget.joinResult.title,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    // Connection status
                    if (!_engineReady)
                      const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      ),
                  ],
                ),
              ),
            ),

            // â”€â”€ Bottom controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Colors.black.withValues(alpha: 0.8), Colors.transparent],
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _ControlButton(
                      icon: _isMuted ? Icons.volume_off : Icons.volume_up,
                      label: _isMuted ? 'Unmute' : 'Mute',
                      onPressed: _toggleMute,
                    ),
                    const SizedBox(width: 24),
                    _ControlButton(
                      icon: _showVideo ? Icons.videocam : Icons.videocam_off,
                      label: _showVideo ? 'Hide video' : 'Show video',
                      onPressed: _toggleVideo,
                    ),
                    const SizedBox(width: 24),
                    _ControlButton(
                      icon: Icons.call_end,
                      label: 'Leave',
                      color: const Color(0xFFE11D48),
                      onPressed: _leave,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final Color color;

  const _ControlButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.color = Colors.white,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color == Colors.white
                  ? Colors.white.withValues(alpha: 0.15)
                  : color,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(height: 4),
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 10)),
        ],
      ),
    );
  }
}

