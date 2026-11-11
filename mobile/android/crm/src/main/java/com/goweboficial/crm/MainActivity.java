package com.goweboficial.crm;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * Tela do app: o /crm do próprio site num WebView (mesmas telas, mesmo login do admin).
 * O nativo cuida do que o navegador não faz: avisos com o app fechado, um canal por tipo de aviso e widgets.
 */
public class MainActivity extends Activity {
    private static final int REQ_NOTIF = 11;
    private static final int REQ_FILE = 20;
    private static final String HOME = "/crm";

    private WebView web;
    private volatile String currentUrl;
    private ValueCallback<Uri[]> fileCb;

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
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " " + Api.userAgent());
        // o site tem tema claro/escuro próprio: o escurecimento automático do celular deixava letra escura em fundo escuro
        if (android.os.Build.VERSION.SDK_INT >= 33) s.setAlgorithmicDarkeningAllowed(false);
        else if (android.os.Build.VERSION.SDK_INT >= 29) s.setForceDark(WebSettings.FORCE_DARK_OFF);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new AtlasBridge(this), "AtlasApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, ua, cd, mime, len) -> download(url, ua, cd, mime));

        String start = urlFrom(getIntent());
        if (savedInstanceState == null || start != null) web.loadUrl(start != null ? start : BuildConfig.BASE_URL + HOME);
        else web.restoreState(savedInstanceState);

        SyncWorker.schedule(this);
        if (Build.VERSION.SDK_INT >= 33 && !Prefs.bool(this, "notifAsked", false) && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Prefs.putBool(this, "notifAsked", true);
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIF);
        }
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
        SyncWorker.now(this);
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
        else super.onBackPressed();
    }

    // ---------- endereços ----------

    private static boolean isOurs(Uri u) {
        Uri base = Uri.parse(BuildConfig.BASE_URL);
        return u != null && u.getHost() != null && u.getHost().equalsIgnoreCase(base.getHost())
                && ("https".equals(u.getScheme()) || u.getScheme() != null && u.getScheme().equals(base.getScheme()));
    }

    private String urlFrom(Intent i) {
        if (i == null) return null;
        String extra = i.getStringExtra("url");
        if (extra != null) {
            if (extra.startsWith("/")) return BuildConfig.BASE_URL + extra;
            return isOurs(Uri.parse(extra)) ? extra : null;
        }
        Uri d = i.getData();
        return d != null && isOurs(d) ? d.toString() : null;
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
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception ignored) {
        }
    }

    /** CSV e outros arquivos do CRM: baixa com o login do app (o navegador não teria a sessão). */
    private void download(String url, String ua, String cd, String mime) {
        Uri u = Uri.parse(url);
        if (!isOurs(u)) {
            openExternal(u);
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, cd, mime);
            DownloadManager.Request r = new DownloadManager.Request(u);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) r.addRequestHeader("Cookie", cookie);
            r.addRequestHeader("User-Agent", ua);
            r.setMimeType(mime);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(r);
            Toast.makeText(this, "Baixando " + name + " (pasta Downloads)", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Não deu para baixar o arquivo.", Toast.LENGTH_SHORT).show();
        }
    }

    boolean trusted() {
        String u = currentUrl;
        return u == null || u.startsWith(BuildConfig.BASE_URL + "/") || u.equals(BuildConfig.BASE_URL) || u.startsWith("data:") || u.equals("about:blank");
    }

    void loadHome() {
        web.loadUrl(BuildConfig.BASE_URL + HOME);
    }

    private void showOffline() {
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0E10;color:#F4F1EA;font-family:sans-serif;text-align:center}"
                + "button{margin-top:20px;background:#3CC46B;color:#0E0E10;border:0;border-radius:16px;padding:14px 24px;font-weight:800;font-size:16px}"
                + "p{color:#B9B3A7}</style></head><body><div><h2>Sem conexão</h2><p>Confira a internet e tente de novo.<br>Os widgets mostram os últimos números.</p>"
                + "<button onclick='AtlasApp.reload()'>Tentar de novo</button></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---------- permissões e configurações ----------

    boolean ignoringBattery() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    void requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && (!Prefs.bool(this, "notifAsked2", false) || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            Prefs.putBool(this, "notifAsked2", true);
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIF);
            return;
        }
        if (!Notifier.canNotify(this)) {
            try {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (Exception e) {
                openAppSettings();
            }
        }
    }

    /** Som, vibração e tela bloqueada de um tipo de aviso (canal do Android). */
    void openChannelSettings(String category) {
        Notifier.channels(this);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                startActivity(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                        .putExtra(Settings.EXTRA_CHANNEL_ID, Notifier.channelFor(category)));
                return;
            }
        } catch (Exception ignored) {
        }
        openAppSettings();
    }

    void openAppSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
        } catch (Exception ignored) {
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCb = null;
        }
    }

    // ---------- WebView ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (isOurs(u)) return false;
            openExternal(u); // WhatsApp, telefone, Instagram, Google Maps, outros sites
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
            if (url != null && url.startsWith(BuildConfig.BASE_URL + HOME)) {
                PushRegistrar.sync(getApplicationContext());
                SyncWorker.now(getApplicationContext());
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) showOffline();
        }
    }

    private class Chrome extends WebChromeClient {
        /** Importar planilha/CSV e enviar fotos pelo CRM. */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
                return true;
            } catch (Exception e) {
                fileCb = null;
                return false;
            }
        }
    }
}
