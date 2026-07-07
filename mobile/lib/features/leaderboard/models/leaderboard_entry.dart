class LeaderboardStudent {
  final String id;
  final String name;
  final String? avatarUrl;

  const LeaderboardStudent({required this.id, required this.name, this.avatarUrl});

  factory LeaderboardStudent.fromJson(Map<String, dynamic> json) => LeaderboardStudent(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? 'Unknown',
        avatarUrl: json['avatarUrl'] as String?,
      );
}

class LeaderboardEntry {
  final int? rank;
  final double totalScore;
  final double examScore;
  final double streakScore;
  final LeaderboardStudent student;

  const LeaderboardEntry({
    required this.rank,
    required this.totalScore,
    required this.examScore,
    required this.streakScore,
    required this.student,
  });

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) => LeaderboardEntry(
        rank: json['rank'] as int?,
        totalScore: (json['totalScore'] as num).toDouble(),
        examScore: (json['examScore'] as num).toDouble(),
        streakScore: (json['streakScore'] as num).toDouble(),
        student: LeaderboardStudent.fromJson(json['student'] as Map<String, dynamic>),
      );
}

class LeaderboardMeta {
  final int? myRank;
  final double? myScore;
  final int total;

  const LeaderboardMeta({this.myRank, this.myScore, required this.total});

  factory LeaderboardMeta.fromJson(Map<String, dynamic> json) => LeaderboardMeta(
        myRank: json['myRank'] as int?,
        myScore: json['myScore'] != null ? (json['myScore'] as num).toDouble() : null,
        total: (json['total'] as int?) ?? 0,
      );
}

class LeaderboardResult {
  final List<LeaderboardEntry> entries;
  final LeaderboardMeta meta;

  const LeaderboardResult({required this.entries, required this.meta});
}
