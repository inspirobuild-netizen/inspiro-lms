// Signs in exactly as an App Store reviewer does, on a real iOS build, against
// production: Log in → review number → Send OTP → fixed code → Home.
//
// Apple rejected 1.1.3 (46) on 28 Oct 2026 because neither review account
// could sign in, and the server shows their device never reached it — the
// failure is on the device, before our API. Nobody had run the iOS app, so
// this runs it in the iOS Simulator on CI and reports every step.
//
//   flutter test integration_test/review_sign_in_test.dart -d <simulator>
//
// Each step prints a `E2E|` line so the CI job can lift the outcome out of the
// log. Review numbers are Firebase fictional numbers: no SMS is ever sent.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:inspiro_mobile/main.dart' as app;

const _numbers = ['7000000001', '7000000002'];
const _code = '430915';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  void report(String step, String detail) => debugPrint('E2E|$step|$detail');

  /// Every piece of text on screen, so a failure says what the user saw.
  String screenText(WidgetTester tester) => tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '')
      .where((s) => s.trim().isNotEmpty)
      .join(' · ');

  /// pumpAndSettle never settles here (the login background animates), so
  /// pump frames until [finder] matches or [timeout] passes.
  Future<bool> pumpUntil(WidgetTester tester, Finder finder,
      {Duration timeout = const Duration(seconds: 45)}) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 250));
      if (finder.evaluate().isNotEmpty) return true;
    }
    return false;
  }

  /// The login screen's red error box shows its message as plain text; any of
  /// these words means the step failed and the text is what a reviewer saw.
  final errorText = find.byWidgetPredicate((w) {
    if (w is! Text) return false;
    final s = (w.data ?? '').toLowerCase();
    return s.contains('failed') ||
        s.contains('unavailable') ||
        s.contains('not authorised') ||
        s.contains('cannot reach') ||
        s.contains('something went wrong') ||
        s.contains('cancelled') ||
        s.contains('too many');
  });

  for (final number in _numbers) {
    testWidgets('review number $number signs in', (tester) async {
      // A fresh install each time: no session left over from the last number.
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();

      app.main();
      // The first launch of a debug build on a cold CI simulator compiles the
      // app as it starts and has taken over a minute (run 3); a release build
      // is precompiled. Allow for that, and log the time so a genuine hang
      // still fails and a slow start is visible rather than hidden.
      final launched = DateTime.now();
      final onLogin = await pumpUntil(tester, find.text('Log in'), timeout: const Duration(seconds: 180));
      final took = DateTime.now().difference(launched).inSeconds;
      report('launch', onLogin ? 'login screen shown after ${took}s' : 'NO LOGIN SCREEN after ${took}s: ${screenText(tester)}');
      expect(onLogin, isTrue);

      await tester.tap(find.text('Log in'));
      await tester.pump(const Duration(milliseconds: 500));

      await tester.enterText(find.byType(TextField).first, number);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text('Send OTP'));
      report('send', 'tapped Send OTP for $number');

      final codeScreen = find.text('Verify OTP');
      final gotCode = await pumpUntil(tester, find.byWidgetPredicate(
        (w) => w is Text && (w.data == 'Verify OTP' || errorText.evaluate().isNotEmpty),
      ));
      if (!gotCode || codeScreen.evaluate().isEmpty) {
        report('send', 'FAILED before the code screen: ${screenText(tester)}');
        fail('no code screen for $number');
      }
      report('send', 'code screen shown');

      // The OTP boxes are drawn over one hidden TextField; typing six digits
      // submits on its own.
      await tester.enterText(find.byType(TextField).last, _code);
      report('verify', 'entered the code');

      final home = find.text('Home');
      final signedIn = await pumpUntil(tester, find.byWidgetPredicate(
        (w) => w is Text && (w.data == 'Home' || errorText.evaluate().isNotEmpty),
      ), timeout: const Duration(seconds: 60));
      if (!signedIn || home.evaluate().isEmpty) {
        report('verify', 'FAILED after the code: ${screenText(tester)}');
        fail('no Home screen for $number');
      }
      final seen = screenText(tester);
      report('result', 'SIGNED IN as $number — ${seen.length > 160 ? seen.substring(0, 160) : seen}');
    });
  }
}
