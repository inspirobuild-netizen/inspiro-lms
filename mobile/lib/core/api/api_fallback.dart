import '../theme/brand.dart';

/// Runs an API call, but if it fails **and** the app is in Demo Mode, returns
/// the provided sample data instead of throwing. In production (Demo Mode off),
/// failures propagate so the UI shows a real error/retry state.
Future<T> apiOrDemo<T>(Future<T> Function() call, T demoFallback) async {
  try {
    return await call();
  } catch (_) {
    if (kDemoMode) return demoFallback;
    rethrow;
  }
}
