# smbj, asn-one, mbassador and BouncyCastle all resolve classes or handler
# methods reflectively; stripping any of them breaks SMB at runtime (SMB3
# signing/encryption, NTLM) with no build-time warning.
-keep class com.hierynomus.** { *; }
-keep class net.engio.mbassy.** { *; }
-keep class org.bouncycastle.** { *; }
-dontwarn com.hierynomus.**
-dontwarn net.engio.mbassy.**
-dontwarn org.bouncycastle.**
-dontwarn org.slf4j.**
