# SslTrustStore reaches React Native's OkHttp hooks by name: the provider's
# setOkHttpClientFactory, its INSTANCE and cached `client` field, and the
# factory interface it implements through a Proxy (matched on method name).
-keep class com.facebook.react.modules.network.OkHttpClientProvider { *; }
-keep interface com.facebook.react.modules.network.OkHttpClientFactory { *; }
