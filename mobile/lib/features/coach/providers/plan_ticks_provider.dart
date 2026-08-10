import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Tick state for the weekly plan's tasks.
///
/// The plan is generated server-side and its tasks are plain strings with no
/// stable identity, so there is nothing to persist against on the backend.
/// Ticks are therefore kept on-device, keyed by "<day>|<index>" and scoped to
/// the plan's `generatedAt`: when the coach regenerates a plan the scope key
/// changes, so old ticks fall away instead of carrying over onto a new week's
/// tasks that merely happen to sit at the same index.
class PlanTicks extends StateNotifier<Set<String>> {
  PlanTicks(this._scopeKey) : super(const {}) {
    _load();
  }

  final String _scopeKey;

  String get _prefsKey => 'coach_plan_ticks_$_scopeKey';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = (prefs.getStringList(_prefsKey) ?? const <String>[]).toSet();
  }

  Future<void> toggle(String taskKey) async {
    final next = Set<String>.from(state);
    if (!next.remove(taskKey)) next.add(taskKey);
    state = next;

    final prefs = await SharedPreferences.getInstance();
    // Drop superseded scopes so a student who has used the app for months is
    // not carrying a key per plan they were ever shown.
    for (final k in prefs.getKeys()) {
      if (k.startsWith('coach_plan_ticks_') && k != _prefsKey) {
        await prefs.remove(k);
      }
    }
    await prefs.setStringList(_prefsKey, next.toList());
  }
}

/// Keyed by the plan's `generatedAt` so each generated plan gets its own ticks.
final planTicksProvider =
    StateNotifierProvider.family<PlanTicks, Set<String>, String>(
  (ref, scopeKey) => PlanTicks(scopeKey),
);

String planTaskKey(String day, int index) => '$day|$index';
