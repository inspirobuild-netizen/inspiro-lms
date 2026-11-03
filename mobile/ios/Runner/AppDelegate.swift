import Flutter
import UIKit

// Classic app-delegate lifecycle, on purpose — the same setup as the CampusOne
// apps that ship push notifications from this account.
//
// The project was created with Flutter's scene-based template (a SceneDelegate
// in Info.plist, plugins registered on an implicit engine). Under that setup
// the plugins are not registered with this delegate, so FlutterAppDelegate
// stops answering application(_:didReceiveRemoteNotification:…). Firebase
// Auth checks that answer before every phone verification, and failed with
// "notification-not-forwarded": no iPhone could sign in, App Review included
// (rejection of 1.1.3 (46), 28 Oct 2026). firebase_auth relies on
// firebase_messaging's plugin to forward those notifications, which only works
// when plugins are registered here.
//
// SceneDelegate.swift is still compiled but unused: nothing in Info.plist
// declares a scene any more.
@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
