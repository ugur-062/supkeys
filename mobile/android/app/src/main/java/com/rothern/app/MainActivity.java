package com.rothern.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Uygulamanın kendi eklentileri (npm paketi değil; `capacitor.plugins.json`a girmez) köprü
        // `super.onCreate` içinde kurulmadan ÖNCE kaydedilir. Web: `window.Capacitor.Plugins.RothernPrint`.
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
