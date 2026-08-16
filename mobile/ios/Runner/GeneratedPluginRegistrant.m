//
//  Generated file. Do not edit.
//

// clang-format off

#import "GeneratedPluginRegistrant.h"

#if __has_include(<agora_rtc_engine/AgoraRtcNgPlugin.h>)
#import <agora_rtc_engine/AgoraRtcNgPlugin.h>
#else
@import agora_rtc_engine;
#endif

#if __has_include(<firebase_auth/FLTFirebaseAuthPlugin.h>)
#import <firebase_auth/FLTFirebaseAuthPlugin.h>
#else
@import firebase_auth;
#endif

#if __has_include(<firebase_core/FLTFirebaseCorePlugin.h>)
#import <firebase_core/FLTFirebaseCorePlugin.h>
#else
@import firebase_core;
#endif

#if __has_include(<firebase_messaging/FLTFirebaseMessagingPlugin.h>)
#import <firebase_messaging/FLTFirebaseMessagingPlugin.h>
#else
@import firebase_messaging;
#endif

#if __has_include(<flutter_local_notifications/FlutterLocalNotificationsPlugin.h>)
#import <flutter_local_notifications/FlutterLocalNotificationsPlugin.h>
#else
@import flutter_local_notifications;
#endif

#if __has_include(<iris_method_channel/IrisMethodChannelPlugin.h>)
#import <iris_method_channel/IrisMethodChannelPlugin.h>
#else
@import iris_method_channel;
#endif

#if __has_include(<media_kit_libs_ios_video/MediaKitLibsIosVideoPlugin.h>)
#import <media_kit_libs_ios_video/MediaKitLibsIosVideoPlugin.h>
#else
@import media_kit_libs_ios_video;
#endif

#if __has_include(<media_kit_video/MediaKitVideoPlugin.h>)
#import <media_kit_video/MediaKitVideoPlugin.h>
#else
@import media_kit_video;
#endif

#if __has_include(<package_info_plus/FPPPackageInfoPlusPlugin.h>)
#import <package_info_plus/FPPPackageInfoPlusPlugin.h>
#else
@import package_info_plus;
#endif

#if __has_include(<permission_handler_apple/PermissionHandlerPlugin.h>)
#import <permission_handler_apple/PermissionHandlerPlugin.h>
#else
@import permission_handler_apple;
#endif

#if __has_include(<shared_preferences_foundation/SharedPreferencesPlugin.h>)
#import <shared_preferences_foundation/SharedPreferencesPlugin.h>
#else
@import shared_preferences_foundation;
#endif

#if __has_include(<sqflite_darwin/SqflitePlugin.h>)
#import <sqflite_darwin/SqflitePlugin.h>
#else
@import sqflite_darwin;
#endif

#if __has_include(<volume_controller/VolumeControllerPlugin.h>)
#import <volume_controller/VolumeControllerPlugin.h>
#else
@import volume_controller;
#endif

#if __has_include(<wakelock_plus/WakelockPlusPlugin.h>)
#import <wakelock_plus/WakelockPlusPlugin.h>
#else
@import wakelock_plus;
#endif

@implementation GeneratedPluginRegistrant

+ (void)registerWithRegistry:(NSObject<FlutterPluginRegistry>*)registry {
  [AgoraRtcNgPlugin registerWithRegistrar:[registry registrarForPlugin:@"AgoraRtcNgPlugin"]];
  [FLTFirebaseAuthPlugin registerWithRegistrar:[registry registrarForPlugin:@"FLTFirebaseAuthPlugin"]];
  [FLTFirebaseCorePlugin registerWithRegistrar:[registry registrarForPlugin:@"FLTFirebaseCorePlugin"]];
  [FLTFirebaseMessagingPlugin registerWithRegistrar:[registry registrarForPlugin:@"FLTFirebaseMessagingPlugin"]];
  [FlutterLocalNotificationsPlugin registerWithRegistrar:[registry registrarForPlugin:@"FlutterLocalNotificationsPlugin"]];
  [IrisMethodChannelPlugin registerWithRegistrar:[registry registrarForPlugin:@"IrisMethodChannelPlugin"]];
  [MediaKitLibsIosVideoPlugin registerWithRegistrar:[registry registrarForPlugin:@"MediaKitLibsIosVideoPlugin"]];
  [MediaKitVideoPlugin registerWithRegistrar:[registry registrarForPlugin:@"MediaKitVideoPlugin"]];
  [FPPPackageInfoPlusPlugin registerWithRegistrar:[registry registrarForPlugin:@"FPPPackageInfoPlusPlugin"]];
  [PermissionHandlerPlugin registerWithRegistrar:[registry registrarForPlugin:@"PermissionHandlerPlugin"]];
  [SharedPreferencesPlugin registerWithRegistrar:[registry registrarForPlugin:@"SharedPreferencesPlugin"]];
  [SqflitePlugin registerWithRegistrar:[registry registrarForPlugin:@"SqflitePlugin"]];
  [VolumeControllerPlugin registerWithRegistrar:[registry registrarForPlugin:@"VolumeControllerPlugin"]];
  [WakelockPlusPlugin registerWithRegistrar:[registry registrarForPlugin:@"WakelockPlusPlugin"]];
}

@end
