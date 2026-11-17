# libwavioalac.so binds these by name: the JNI symbols embed the class names
# (Java_expo_modules_alacdecoder_<Class>_<method>), and JNI_OnLoad looks up
# FfmpegAudioDecoder and its growOutputBuffer callback with FindClass /
# GetMethodID. includedescriptorclasses keeps SimpleDecoderOutputBuffer, which
# appears in that method's JNI signature.
-keepclasseswithmembernames class expo.modules.alacdecoder.** {
    native <methods>;
}
-keep, includedescriptorclasses class expo.modules.alacdecoder.FfmpegAudioDecoder {
    private java.nio.ByteBuffer growOutputBuffer(androidx.media3.decoder.SimpleDecoderOutputBuffer, int);
}
