class LiveClass {
  final String id;
  final String batchId;
  final String subject;
  final String title;
  final String instructorId;
  final DateTime startTime;
  final DateTime? endTime;
  final String? agoraChannel;
  final bool isCompleted;

  const LiveClass({
    required this.id,
    required this.batchId,
    required this.subject,
    required this.title,
    required this.instructorId,
    required this.startTime,
    this.endTime,
    this.agoraChannel,
    required this.isCompleted,
  });

  factory LiveClass.fromJson(Map<String, dynamic> json) => LiveClass(
        id: json['id'] as String,
        batchId: json['batchId'] as String,
        subject: json['subject'] as String,
        title: json['title'] as String,
        instructorId: json['instructorId'] as String,
        startTime: DateTime.parse(json['startTime'] as String),
        endTime: json['endTime'] != null
            ? DateTime.parse(json['endTime'] as String)
            : null,
        agoraChannel: json['agoraChannel'] as String?,
        isCompleted: json['isCompleted'] as bool,
      );

  bool get isLive => agoraChannel != null && !isCompleted;
  bool get isUpcoming => agoraChannel == null && !isCompleted;
}

class JoinLiveClassResult {
  final String agoraToken;
  final int agoraUid;
  final String agoraAppId;
  final String channelName;
  final String title;
  final String subject;
  final String instructorId;

  const JoinLiveClassResult({
    required this.agoraToken,
    required this.agoraUid,
    required this.agoraAppId,
    required this.channelName,
    required this.title,
    required this.subject,
    required this.instructorId,
  });

  factory JoinLiveClassResult.fromJson(Map<String, dynamic> json) =>
      JoinLiveClassResult(
        agoraToken: json['agoraToken'] as String,
        agoraUid: json['agoraUid'] as int,
        agoraAppId: json['agoraAppId'] as String,
        channelName: json['channelName'] as String,
        title: json['title'] as String,
        subject: json['subject'] as String,
        instructorId: json['instructorId'] as String,
      );
}
