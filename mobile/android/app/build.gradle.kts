import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Firebase / FCM
    id("com.google.gms.google-services")
}

// Signing config from key.properties (never committed). Falls back to debug
// signing when the file is absent so `flutter build apk --release` still compiles.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val useKeystore = keystorePropertiesFile.exists()
if (useKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.bizence.inspiro_mobile"
    // sqflite_android 2.4.x uses API-36 symbols (BAKLAVA, Locale.of, Thread.threadId);
    // Agora needs >=33. Compile against 36 to satisfy every plugin.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications (uses java.time on older APIs)
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // Must match the Firebase Android app and the Play Console listing.
        applicationId = "com.bizence.inspiro"
        // Firebase Messaging + Agora require 23+.
        minSdk = flutter.minSdkVersion
        // Play requires new apps to target API 35 (Android 15).
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (useKeystore) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = if (useKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
