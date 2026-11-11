package com.goweboficial.entregador;

import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * window.AtlasApp — o que as telas do /entregador chamam quando estão dentro do app
 * (ver src/lib/native-bridge.ts no site). Fora do app esse objeto não existe.
 */
final class AtlasBridge {
    private final MainActivity a;

    AtlasBridge(MainActivity a) { this.a = a; }

    @JavascriptInterface
    public String version() { return BuildConfig.VERSION_NAME; }

    @JavascriptInterface
    public String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("tracking", Prefs.tracking(a));
            o.put("permission", a.locationPermission());
            o.put("lastSentAt", Prefs.lng(a, "lastSentAt", 0));
            o.put("accuracy", (double) Prefs.flt(a, "accuracy", 0f));
            o.put("sig", Prefs.str(a, "sig", ""));
            o.put("error", Prefs.str(a, "error", ""));
            o.put("notifications", Notifier.canNotify(a));
            o.put("battery", a.ignoringBattery());
            o.put("push", Prefs.bool(a, "pushActive", false));
            o.put("version", BuildConfig.VERSION_NAME);
            o.put("overlay", Offer.canOverlay(a));
            o.put("fullScreen", Offer.canFullScreen(a));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public void startTracking() {
        if (a.trusted()) a.runOnUiThread(a::startTracking);
    }

    @JavascriptInterface
    public void stopTracking() {
        if (a.trusted()) a.runOnUiThread(() -> {
            LocationService.stop(a);
            a.notifyWeb();
        });
    }

    @JavascriptInterface
    public void openAppSettings() {
        if (a.trusted()) a.runOnUiThread(a::openAppSettings);
    }

    @JavascriptInterface
    public void requestNotifications() {
        if (a.trusted()) a.runOnUiThread(a::requestNotifications);
    }

    /** "Aparecer sobre outros apps": a corrida abre por cima do Instagram, WhatsApp etc. */
    @JavascriptInterface
    public void requestOverlay() {
        if (a.trusted()) a.runOnUiThread(a::requestOverlay);
    }

    /** Android 14+: permissão de notificação em tela cheia (tela bloqueada). */
    @JavascriptInterface
    public void requestFullScreen() {
        if (a.trusted()) a.runOnUiThread(a::requestFullScreen);
    }

    @JavascriptInterface
    public void requestBatteryExemption() {
        if (a.trusted()) a.runOnUiThread(a::requestBatteryExemption);
    }

    /** Antes de "Sair deste celular": apaga o aviso deste aparelho no servidor e para o GPS (síncrono). */
    @JavascriptInterface
    public void beforeLogout() {
        if (!a.trusted()) return;
        String cookie = Api.cookieHeader();
        PushRegistrar.unregister(a, cookie);
        a.runOnUiThread(() -> LocationService.stop(a));
    }

    @JavascriptInterface
    public void reload() {
        a.runOnUiThread(a::loadHome);
    }
}
