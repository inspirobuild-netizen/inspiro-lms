import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000'); // Android emulator → host

class ApiClient {
  ApiClient._();

  static final Dio _dio = Dio(
    BaseOptions(
      baseUrl: _kBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ),
  )..interceptors.addAll([
      _AuthInterceptor(),
      _ErrorInterceptor(),
    ]);

  static Dio get dio => _dio;
}

class _AuthInterceptor extends Interceptor {
  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
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
