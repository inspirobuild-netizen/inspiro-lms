import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../notifications/notification_service.dart';

class AuthUser {
  final String id;
  final String name;
  final String phone;
  final String role;
  final String? avatarUrl;

  const AuthUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    this.avatarUrl,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? '',
        phone: json['phone'] as String,
        role: json['role'] as String,
        avatarUrl: json['avatarUrl'] as String?,
      );
}

class AuthState {
  final AuthUser? user;
  final String? accessToken;
  final bool initialised;

  const AuthState({this.user, this.accessToken, this.initialised = false});

  bool get isAuthenticated => user != null && accessToken != null;
  AuthState copyWith({AuthUser? user, String? accessToken, bool? initialised}) => AuthState(
        user: user ?? this.user,
        accessToken: accessToken ?? this.accessToken,
        initialised: initialised ?? this.initialised,
      );
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    _restore();
    return const AuthState();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    final id = prefs.getString('user_id');
    final name = prefs.getString('user_name') ?? '';
    final phone = prefs.getString('user_phone') ?? '';
    final role = prefs.getString('user_role') ?? 'student';

    if (token != null && id != null) {
      state = AuthState(
        user: AuthUser(id: id, name: name, phone: phone, role: role),
        accessToken: token,
        initialised: true,
      );
    } else {
      state = state.copyWith(initialised: true);
    }
  }

  Future<void> setAuth(AuthUser user, String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', token);
    await prefs.setString('user_id', user.id);
    await prefs.setString('user_name', user.name);
    await prefs.setString('user_phone', user.phone);
    await prefs.setString('user_role', user.role);
    state = AuthState(user: user, accessToken: token, initialised: true);
  }

  Future<void> clearAuth() async {
    // Unregister FCM token before clearing credentials
    await NotificationService.unregisterToken();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('user_id');
    await prefs.remove('user_name');
    await prefs.remove('user_phone');
    await prefs.remove('user_role');
    state = const AuthState(initialised: true);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
