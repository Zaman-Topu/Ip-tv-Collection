import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BUG TV',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(),
      home: const BugTvPlayer(),
    );
  }
}

class BugTvPlayer extends StatefulWidget {
  const BugTvPlayer({super.key});

  @override
  State<BugTvPlayer> createState() => _BugTvPlayerState();
}

class _BugTvPlayerState extends State<BugTvPlayer> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    
    // Initialize WebViewController
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF050505))
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebResourceError: ${error.description}');
          },
        ),
      )
      ..loadRequest(Uri.parse('https://zaman-topu.github.io/Ip-tv-Collection/web/'));

    // Android-specific WebView optimizations for media playback and TV hardware acceleration
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      // Enable DOM Storage, Database and Mixed Content
      platform.setMediaPlaybackRequiresUserGesture(false);
      
      // Access underlying WebSettings for Android
      AndroidWebViewController.enableDebugging(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: WillPopScope(
        onWillPop: () async {
          if (await _controller.canGoBack()) {
            await _controller.goBack();
            return false;
          }
          return true;
        },
        child: WebViewWidget(controller: _controller),
      ),
    );
  }
}
