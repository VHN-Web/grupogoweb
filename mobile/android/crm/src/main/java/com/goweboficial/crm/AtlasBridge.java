package com.goweboficial.crm;

import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/** window.AtlasApp dentro do app do CRM (ver src/lib/native-bridge.ts e components/crm/CrmNativePanel.tsx). */
final class AtlasBridge {
    private final MainActivity a;

    AtlasBridge(MainActivity a) { this.a = a; }

    @JavascriptInterface
    public String app() { return "crm"; }

    @JavascriptInterface
    public String version() { return BuildConfig.VERSION_NAME; }

    @JavascriptInterface
    public String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("notifications", Notifier.canNotify(a));
            o.put("battery", a.ignoringBattery());
            o.put("push", Prefs.bool(a, "pushActive", false));
            o.put("version", BuildConfig.VERSION_NAME);
            o.put("lastSync", Prefs.lng(a, "lastSync", 0));
            // campos que o site espera da ponte (compatível com o app do entregador)
            o.put("tracking", false);
            o.put("permission", "granted");
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public void requestNotifications() {
        if (a.trusted()) a.runOnUiThread(a::requestNotifications);
    }

    @JavascriptInterface
    public void openAppSettings() {
        if (a.trusted()) a.runOnUiThread(a::openAppSettings);
    }

    @JavascriptInterface
    public void openChannelSettings(String category) {
        if (a.trusted()) a.runOnUiThread(() -> a.openChannelSettings(category));
    }

    @JavascriptInterface
    public void requestBatteryExemption() {
        if (a.trusted()) a.runOnUiThread(a::requestBatteryExemption);
    }

    @JavascriptInterface
    public void syncNow() {
        SyncWorker.now(a);
    }

    // o app do CRM não tem GPS: métodos vazios para a ponte ser a mesma do entregador
    @JavascriptInterface
    public void startTracking() {}

    @JavascriptInterface
    public void stopTracking() {}

    /** Antes de "Sair": desliga os avisos deste aparelho e limpa os widgets (síncrono). */
    @JavascriptInterface
    public void beforeLogout() {
        if (!a.trusted()) return;
        PushRegistrar.unregister(a, Api.cookieHeader());
        Prefs.putStr(a, "widget", "");
        Prefs.putStr(a, "since", "");
        Notifier.live(a, "");
        a.runOnUiThread(() -> Widgets.updateAll(a, false));
    }

    /** A ilha do CRM web mudou: atualiza a notificação "ao vivo" com cronômetro ("" = some). */
    @JavascriptInterface
    public void setLive(String json) {
        if (!a.trusted()) return;
        String key = json == null ? "" : json;
        Prefs.putStr(a, "liveKey", key.isEmpty() ? "" : "web:" + key.hashCode());
        Notifier.live(a, key);
    }

    @JavascriptInterface
    public void reload() {
        a.runOnUiThread(a::loadHome);
    }
}
