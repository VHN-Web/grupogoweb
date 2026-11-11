package com.goweboficial.entregador;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.List;

/**
 * Tela do app: um WebView com o /entregador do próprio site (mesmas telas, mesma sessão, mesmas APIs).
 * O que o navegador não consegue — GPS e avisos com o app fechado — fica com LocationService e o Firebase.
 */
public class MainActivity extends Activity {
    private static final int REQ_LOC = 10;
    private static final int REQ_NOTIF = 11;
    private static final String HOME = "/entregador";

    private WebView web;
    private volatile String currentUrl;
    private boolean pendingStart;
    private GeolocationPermissions.Callback geoCb;
    private String geoOrigin;

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Notifier.channels(this);

        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(0xFF0E0E10);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0E0E10);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " " + Api.userAgent());

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new AtlasBridge(this), "AtlasApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, ua, cd, mime, len) -> openExternal(Uri.parse(url)));

        String start = urlFrom(getIntent());
        if (savedInstanceState == null || start != null) web.loadUrl(start != null ? start : BuildConfig.BASE_URL + HOME);
        else web.restoreState(savedInstanceState);

        // voltou a abrir com o motoboy online (ex.: o Android tinha fechado o serviço): religa o GPS
        if (Prefs.tracking(this)) LocationService.start(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String u = urlFrom(intent);
        if (u != null) web.loadUrl(u);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Prefs.tracking(this) && !LocationService.running) LocationService.start(this);
        notifyWeb();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true); // não fecha: o GPS segue pelo serviço
    }

    // ---------- endereços ----------

    private static boolean isOurs(Uri u) {
        Uri base = Uri.parse(BuildConfig.BASE_URL);
        return u != null && u.getHost() != null && u.getHost().equalsIgnoreCase(base.getHost())
                && ("https".equals(u.getScheme()) || u.getScheme() != null && u.getScheme().equals(base.getScheme()));
    }

    /** Link de acesso (https ou gowebentregador://acesso/<token>) ou toque numa notificação. */
    private String urlFrom(Intent i) {
        if (i == null) return null;
        String extra = i.getStringExtra("url");
        if (extra != null) {
            if (extra.startsWith("/")) return BuildConfig.BASE_URL + extra;
            return isOurs(Uri.parse(extra)) ? extra : null;
        }
        Uri d = i.getData();
        if (d == null) return null;
        if ("gowebentregador".equals(d.getScheme()) && "acesso".equals(d.getHost())) {
            String tok = d.getLastPathSegment();
            return tok != null && tok.matches("[A-Za-z0-9_-]{20,64}") ? BuildConfig.BASE_URL + "/entregador/acesso/" + tok : null;
        }
        return isOurs(d) ? d.toString() : null;
    }

    private void openExternal(Uri u) {
        try {
            Intent i;
            if ("intent".equals(u.getScheme())) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    String fb = i.getStringExtra("browser_fallback_url");
                    if (fb != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fb)));
                }
                return;
            }
            i = new Intent(Intent.ACTION_VIEW, u);
            startActivity(i);
        } catch (Exception ignored) {
        }
    }

    /** A ponte só atende páginas do próprio site (ou a tela de "sem conexão"). */
    boolean trusted() {
        String u = currentUrl;
        return u == null || u.startsWith(BuildConfig.BASE_URL + "/") || u.equals(BuildConfig.BASE_URL) || u.startsWith("data:") || u.equals("about:blank");
    }

    void loadHome() {
        web.loadUrl(BuildConfig.BASE_URL + HOME);
    }

    void notifyWeb() {
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('atlas:status'))", null);
    }

    private void showOffline() {
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0E10;color:#F4F1EA;font-family:sans-serif;text-align:center}"
                + "button{margin-top:20px;background:#3CC46B;color:#0E0E10;border:0;border-radius:16px;padding:14px 24px;font-weight:800;font-size:16px}"
                + "p{color:#B9B3A7}</style></head><body><div><h2>" + L.t(this, "offline_page_title") + "</h2><p>" + L.t(this, "offline_page_body")
                + "</p><button onclick='AtlasApp.reload()'>" + L.t(this, "retry") + "</button></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---------- permissões ----------

    boolean hasLocation() { return LocationService.hasPermission(this); }

    String locationPermission() {
        if (hasLocation()) return "granted";
        return Prefs.bool(this, "locAsked", false) ? "denied" : "prompt";
    }

    boolean ignoringBattery() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    /** Ficou online no site: pede a localização (se preciso) e liga o serviço. */
    void startTracking() {
        if (!hasLocation()) {
            pendingStart = true;
            askLocation();
            return;
        }
        LocationService.start(this);
        if (Build.VERSION.SDK_INT >= 33 && !Prefs.bool(this, "notifAsked", false) && !Notifier.canNotify(this)) requestNotifications();
        notifyWeb();
    }

    private void askLocation() {
        Prefs.putBool(this, "locAsked", true);
        List<String> p = new ArrayList<>();
        p.add(Manifest.permission.ACCESS_FINE_LOCATION);
        p.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            p.add(Manifest.permission.POST_NOTIFICATIONS);
            Prefs.putBool(this, "notifAsked", true);
        }
        requestPermissions(p.toArray(new String[0]), REQ_LOC);
    }

    void requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && (!Prefs.bool(this, "notifAsked", false) || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            Prefs.putBool(this, "notifAsked", true);
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIF);
            return;
        }
        if (!Notifier.canNotify(this)) openNotificationSettings();
    }

    private void openNotificationSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(i);
        } catch (Exception e) {
            openAppSettings();
        }
    }

    void openAppSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
        } catch (Exception ignored) {
        }
    }

    void requestOverlay() {
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            openAppSettings();
        }
    }

    void requestFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return;
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            openAppSettings();
        }
    }

    @SuppressLint("BatteryLife")
    void requestBatteryExemption() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOC) {
            boolean ok = hasLocation();
            if (geoCb != null) {
                geoCb.invoke(geoOrigin, ok, false);
                geoCb = null;
            }
            if (pendingStart) {
                pendingStart = false;
                if (ok) LocationService.start(this);
            }
        }
        notifyWeb();
    }

    // ---------- WebView ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (isOurs(u)) return false;
            openExternal(u); // WhatsApp, telefone, Google Maps, Waze, outros sites
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            currentUrl = url;
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            currentUrl = url;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            currentUrl = url;
            CookieManager.getInstance().flush();
            if (url != null && url.startsWith(BuildConfig.BASE_URL + HOME) && !url.contains("/entregador/entrar")) PushRegistrar.sync(getApplicationContext());
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) showOffline();
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!isOurs(Uri.parse(origin))) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocation()) {
                callback.invoke(origin, true, false);
                return;
            }
            geoCb = callback;
            geoOrigin = origin;
            askLocation();
        }
    }
}
