package com.goweboficial.crm;

import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Chamadas às mesmas APIs do site (/api/crm/*), com o cookie de sessão do WebView (mp_session, login do admin).
 * Assim o app nativo não tem login próprio: usa 100% a sessão do /crm.
 */
final class Api {
    private Api() {}

    static final class Res {
        final int code;
        final String body;
        Res(int code, String body) { this.code = code; this.body = body; }
        JSONObject json() {
            try { return new JSONObject(body); } catch (Exception e) { return null; }
        }
    }

    /** Cookies do site guardados pelo WebView (inclui os httpOnly). Chame na thread principal. */
    static String cookieHeader() {
        try {
            return CookieManager.getInstance().getCookie(BuildConfig.BASE_URL);
        } catch (Throwable t) {
            return null;
        }
    }

    /** Cookie lido na thread principal (para quem roda em segundo plano, como o Worker dos widgets). */
    static String cookieFromAnyThread() {
        if (Looper.myLooper() == Looper.getMainLooper()) return cookieHeader();
        final String[] out = new String[1];
        final java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
        new Handler(Looper.getMainLooper()).post(() -> {
            out[0] = cookieHeader();
            done.countDown();
        });
        try {
            done.await(5, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
        return out[0];
    }

    static boolean hasSession(String cookie) {
        return cookie != null && cookie.contains("mp_session=");
    }

    /** Parte do cookie que identifica o entregador (para saber se trocou de conta). */
    static String sessionKey(String cookie) {
        if (cookie == null) return "";
        for (String part : cookie.split(";")) {
            String p = part.trim();
            if (p.startsWith("mp_session=")) return Integer.toHexString(p.hashCode());
        }
        return "";
    }

    static String userAgent() {
        return "GoWebCRM/" + BuildConfig.VERSION_NAME + " (Android " + Build.VERSION.RELEASE + ")";
    }

    /** Envia e devolve o código HTTP (-1 = sem internet). Nunca chame na thread principal. */
    static Res send(String method, String path, String json, String cookie) {
        HttpURLConnection con = null;
        try {
            URL u = new URL(BuildConfig.BASE_URL + path);
            con = (HttpURLConnection) u.openConnection();
            con.setRequestMethod(method);
            con.setConnectTimeout(10000);
            con.setReadTimeout(15000);
            con.setInstanceFollowRedirects(false);
            con.setUseCaches(false);
            con.setRequestProperty("Accept", "application/json");
            con.setRequestProperty("User-Agent", userAgent());
            if (cookie != null) con.setRequestProperty("Cookie", cookie);
            if (json != null) {
                byte[] b = json.getBytes(StandardCharsets.UTF_8);
                con.setRequestProperty("Content-Type", "application/json");
                con.setDoOutput(true);
                con.setFixedLengthStreamingMode(b.length);
                try (OutputStream os = con.getOutputStream()) {
                    os.write(b);
                }
            }
            int code = con.getResponseCode();
            InputStream is = code >= 400 ? con.getErrorStream() : con.getInputStream();
            return new Res(code, read(is));
        } catch (Exception e) {
            return new Res(-1, String.valueOf(e.getMessage()));
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String read(InputStream is) {
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        } catch (Exception ignored) {
        }
        return sb.toString();
    }
}
