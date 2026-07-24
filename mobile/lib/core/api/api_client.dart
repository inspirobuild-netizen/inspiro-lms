import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Defaults to production; override with --dart-define=API_BASE_URL=http://10.0.2.2:3000
// when running against a local API from the Android emulator.
const _kBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'https://api.inspiroiasacademy.in');

class ApiClient {
  ApiClient._();

  static late final Dio _dio;
  // Bare client used only to hit /auth/refresh — no auth interceptor, so a failed
  // refresh can never recurse back into the refresh logic.
  static late final Dio _refreshDio;
  static late final PersistCookieJar _cookieJar;
  static bool _initialised = false;

  /// Invoked when refreshing fails (refresh token expired/revoked) so the app
  /// can drop the session and route back to login. Wired up by AuthNotifier.
  static Future<void> Function()? onSessionExpired;

  /// Must be awaited in main() before the app touches [dio]. Sets up a
  /// disk-backed cookie jar so the httpOnly refresh-token cookie survives
  /// restarts, and installs the auth + refresh interceptors.
  static Future<void> init() async {
    if (_initialised) return;
    final dir = await getApplicationDocumentsDirectory();
    _cookieJar = PersistCookieJar(storage: FileStorage('${dir.path}/.cookies'));

    BaseOptions base() => BaseOptions(
          baseUrl: _kBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        );

    _refreshDio = Dio(base())..interceptors.add(CookieManager(_cookieJar));

    _dio = Dio(base())
      ..interceptors.addAll([
        CookieManager(_cookieJar),
        _AuthInterceptor(),
        _ErrorInterceptor(),
      ]);
    _initialised = true;
  }

  static Dio get dio => _dio;

  /// Drops the persisted refresh cookie — call on explicit sign-out so a stale
  /// refresh token can't be reused.
  static Future<void> clearCookies() async {
    if (_initialised) await _cookieJar.deleteAll();
  }
}

class _AuthInterceptor extends Interceptor {
  // Single-flight: concurrent 401s share one refresh instead of stampeding.
  static Future<bool>? _refreshing;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final is401 = err.response?.statusCode == 401;
    final path = err.requestOptions.path;
    final alreadyRetried = err.requestOptions.extra['__retried'] == true;
    // Never try to refresh the auth calls themselves.
    final isAuthCall = path.contains('/auth/');

    if (is401 && !alreadyRetried && !isAuthCall) {
      final refreshed = await _refreshOnce();
      if (refreshed) {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('access_token');
        final opts = err.requestOptions;
        opts.extra['__retried'] = true;
        if (token != null) opts.headers['Authorization'] = 'Bearer $token';
        try {
          final clone = await ApiClient._dio.fetch(opts);
          return handler.resolve(clone);
        } on DioException catch (e) {
          return handler.next(e);
        }
      } else {
        // Refresh token is gone/expired — end the session.
        await ApiClient.onSessionExpired?.call();
      }
    }
    handler.next(err);
  }

  Future<bool> _refreshOnce() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    try {
      // Send an empty JSON object, not an empty body — Fastify rejects
      // Content-Type: application/json with no body (FST_ERR_CTP_EMPTY_JSON_BODY).
      final res = await ApiClient._refreshDio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        data: const <String, dynamic>{},
      );
      final data = res.data!['data'] as Map<String, dynamic>;
      final newToken = data['accessToken'] as String;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('access_token', newToken);
      return true;
    } catch (_) {
      return false;
    }
  }
}

class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final data = err.response?.data;
    if (data is Map && data['error'] != null) {
      final apiErr = data['error'] as Map;
      handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          response: err.response,
          message: (apiErr['message'] as String?) ?? err.message,
          error: apiErr['code'],
        ),
      );
      return;
    }
    handler.next(err);
  }
}
