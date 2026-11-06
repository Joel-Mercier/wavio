# HttpStack clears OkHttpClientProvider's cached `client` field by name, and the
# expo-audio patch reaches getOkHttpClient through reflection.
-keep class com.facebook.react.modules.network.OkHttpClientProvider { *; }
-keep interface com.facebook.react.modules.network.OkHttpClientFactory { *; }
