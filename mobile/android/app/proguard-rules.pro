# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Flutter's embedding references Play Core deferred-components classes that we
# don't bundle (we don't use Play Feature Delivery). Tell R8 not to error on them.
-dontwarn com.google.android.play.core.**
-keep class com.google.android.play.core.** { *; }

# Agora
-keep class io.agora.** { *; }
-dontwarn io.agora.**

# Firebase / FCM
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }

# Kotlin
-keep class kotlin.** { *; }
-dontwarn kotlin.**

# OkHttp (used by Dio indirectly)
-dontwarn okhttp3.**
-dontwarn okio.**

# Prevent stripping BuildConfig (namespace, not applicationId)
-keep class com.bizence.inspiro_mobile.BuildConfig { *; }
