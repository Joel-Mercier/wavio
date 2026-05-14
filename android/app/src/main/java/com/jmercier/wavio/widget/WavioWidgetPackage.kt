package com.jmercier.wavio.widget

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WavioWidgetPackage : ReactPackage {
    override fun createNativeModules(reactCtx: ReactApplicationContext): List<NativeModule> =
        listOf(WavioWidgetModule(reactCtx))

    override fun createViewManagers(reactCtx: ReactApplicationContext): List<ViewManager<View, *>> =
        emptyList()
}
