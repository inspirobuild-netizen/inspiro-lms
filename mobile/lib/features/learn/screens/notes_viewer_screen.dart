import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/brand.dart';
import '../../../core/widgets/app_ui.dart';

/// Reads a lesson's notes inside the app.
///
/// Never hands the file to an external viewer: notes are paid course content
/// served from an endpoint that re-checks enrolment on every request, so the
/// URL is not something to pass to another app. It is downloaded through the
/// authenticated client into the app's private cache and rendered here.
class NotesViewerScreen extends StatefulWidget {
  final String lessonId;
  final String title;
  const NotesViewerScreen({super.key, required this.lessonId, required this.title});

  @override
  State<NotesViewerScreen> createState() => _NotesViewerScreenState();
}

class _NotesViewerScreenState extends State<NotesViewerScreen> {
  String? _path;
  String? _error;
  bool _loading = true;

  int _page = 0;
  int _pages = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Bytes, not a plain URL: the endpoint needs the bearer token, which a
      // PDF widget pointed at a URL would not send.
      final res = await ApiClient.dio.get<List<int>>(
        '/api/v1/lessons/${widget.lessonId}/file',
        options: Options(responseType: ResponseType.bytes),
      );

      final dir = await getApplicationCacheDirectory();
      final file = File('${dir.path}/notes_${widget.lessonId}.pdf');
      await file.writeAsBytes(res.data!, flush: true);

      if (!mounted) return;
      setState(() {
        _path = file.path;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not open these notes. Check your connection and try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: widget.title,
      body: _error != null
          ? Center(child: ErrorRetry(message: _error!, onRetry: _load))
          : _loading
              ? const Center(child: LoadingState())
              : Stack(
                  children: [
                    PDFView(
                      filePath: _path!,
                      swipeHorizontal: false,
                      autoSpacing: true,
                      pageFling: false,
                      // Students scroll continuously through notes and pinch to
                      // read small print; horizontal paging fights both.
                      fitPolicy: FitPolicy.WIDTH,
                      onRender: (pages) => mounted ? setState(() => _pages = pages ?? 0) : null,
                      onPageChanged: (page, _) =>
                          mounted ? setState(() => _page = page ?? 0) : null,
                      onError: (_) => mounted
                          ? setState(() => _error = 'These notes could not be displayed.')
                          : null,
                    ),
                    if (_pages > 0)
                      Positioned(
                        right: 16,
                        bottom: 16,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: Brand.surface.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                          ),
                          child: Text(
                            '${_page + 1} / $_pages',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}
