package com.goweboficial.entregador;

import android.Manifest;
import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * GPS em segundo plano: serviço em primeiro plano (aviso fixo) que envia a posição para /api/entregador/ping
 * enquanto o entregador está online — com o app fechado, minimizado ou a tela bloqueada.
 * Mesma regra do site: envia quando andou 20 m ou a cada 8 s; parado, reenvia a cada 20 s.
 */
public class LocationService extends Service implements LocationListener {
    static volatile boolean running;

    private final Handler h = new Handler(Looper.getMainLooper());
    private LocationManager lm;
    private PowerManager.WakeLock wl;
    private Location best;
    private Location sentLoc;
    private long sentAt;
    private long notifAt;
    private boolean busy;
    private boolean listening;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            maybeSend(true);
            h.postDelayed(this, 5000);
        }
    };

    static boolean hasPermission(Context c) {
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static void start(Context c) {
        if (!hasPermission(c)) return;
        if (!Prefs.tracking(c) || !running) Prefs.remove(c, "knownMine", "knownOpen");
        Prefs.setTracking(c, true);
        try {
            ContextCompat.startForegroundService(c, new Intent(c, LocationService.class));
        } catch (Exception e) {
            Prefs.putStr(c, "error", "start");
        }
    }

    static void stop(Context c) {
        Prefs.setTracking(c, false);
        c.stopService(new Intent(c, LocationService.class));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notifier.channels(this);
        try {
            Notification n = Notifier.tracking(this, L.t(this, "sending"));
            if (Build.VERSION.SDK_INT >= 29) startForeground(Notifier.ID_TRACK, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(Notifier.ID_TRACK, n);
        } catch (Exception e) {
            // Android não deixou ligar o GPS em segundo plano agora (ex.: reinício pelo sistema): pede para tocar
            Prefs.putStr(this, "error", "foreground");
            Notifier.show(this, "resume", L.t(this, "resume_title"), L.t(this, "resume_body"), "/entregador");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!Prefs.tracking(this) || !hasPermission(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        if (!listening) listen();
        return START_STICKY;
    }

    private void listen() {
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31 && lm.hasProvider(LocationManager.FUSED_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.FUSED_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
            } else {
                List<String> all = lm.getAllProviders();
                if (all.contains(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
                if (all.contains(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000L, 0f, this, Looper.getMainLooper());
            }
            Location last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last != null && System.currentTimeMillis() - last.getTime() < 120000) best = last;
            listening = true;
        } catch (SecurityException e) {
            Prefs.putStr(this, "error", "permission");
            stop(this);
            return;
        } catch (Exception e) {
            Prefs.putStr(this, "error", "gps");
        }
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "goweb:entregador-gps");
                wl.setReferenceCounted(false);
                wl.acquire(12L * 60 * 60 * 1000);
            }
        } catch (Exception ignored) {
        }
        h.removeCallbacks(tick);
        h.postDelayed(tick, 5000);
        maybeSend(false);
    }

    @Override
    public void onLocationChanged(Location l) {
        if (l == null) return;
        // GPS recente vale mais que posição da rede
        if (best != null && LocationManager.GPS_PROVIDER.equals(best.getProvider()) && !LocationManager.GPS_PROVIDER.equals(l.getProvider())
                && l.getTime() - best.getTime() < 15000) return;
        best = l;
        maybeSend(false);
    }

    // necessários em Android < 11 (a interface ainda não tinha implementação padrão)
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}

    private void maybeSend(boolean keepalive) {
        if (best == null || busy || !running) return;
        long now = System.currentTimeMillis();
        float moved = sentLoc == null ? Float.MAX_VALUE : best.distanceTo(sentLoc);
        boolean due = keepalive ? now - sentAt > 20000 : (sentLoc == null || moved > 20 || now - sentAt > 8000);
        if (due) send(best);
    }

    private void send(final Location l) {
        final String cookie = Api.cookieHeader();
        if (!Api.hasSession(cookie)) {
            sessionEnded();
            return;
        }
        final JSONObject b = new JSONObject();
        try {
            b.put("lat", l.getLatitude());
            b.put("lng", l.getLongitude());
            b.put("accuracy", l.hasAccuracy() ? (double) l.getAccuracy() : JSONObject.NULL);
            b.put("heading", l.hasBearing() ? (double) l.getBearing() : JSONObject.NULL);
            b.put("speed", l.hasSpeed() ? (double) l.getSpeed() : JSONObject.NULL);
        } catch (Exception e) {
            return;
        }
        busy = true;
        Bg.run(() -> {
            final Api.Res r = Api.send("POST", "/api/entregador/ping", b.toString(), cookie);
            h.post(() -> onResult(l, r));
        });
    }

    private void onResult(Location l, Api.Res r) {
        busy = false;
        if (!running) return;
        if (r.code == 401) {
            sessionEnded();
            return;
        }
        if (r.code != 200) {
            Prefs.putStr(this, "error", r.code == -1 ? "network" : "http" + r.code);
            long now = System.currentTimeMillis();
            if (r.code == -1 && now - notifAt > 60000) {
                notifAt = now;
                Notifier.updateTracking(this, L.t(this, "no_net"));
            }
            return;
        }
        sentLoc = l;
        sentAt = System.currentTimeMillis();
        Prefs.putLng(this, "lastSentAt", sentAt);
        Prefs.putFlt(this, "accuracy", l.hasAccuracy() ? l.getAccuracy() : 0f);
        Prefs.putStr(this, "error", "");
        JSONObject j = r.json();
        if (j == null) return;
        String lang = j.optString("lang", "");
        if (!lang.isEmpty()) Prefs.putStr(this, "lang", lang);
        Prefs.putStr(this, "sig", j.optString("deliveries", ""));
        Notifier.diff(this, j);
        if (!j.optBoolean("online", true)) {
            // ficou offline (pelo site, pelo painel ou em outro aparelho): desliga o GPS
            stop(this);
            return;
        }
        if (sentAt - notifAt > 60000) {
            notifAt = sentAt;
            String hhmm = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(sentAt));
            Notifier.updateTracking(this, L.t(this, "sent_at").replace("{t}", hhmm));
        }
    }

    private void sessionEnded() {
        Notifier.show(this, "sessao", L.t(this, "session_title"), L.t(this, "session_body"), "/entregador/entrar");
        stop(this);
    }

    @Override
    public void onDestroy() {
        running = false;
        listening = false;
        h.removeCallbacksAndMessages(null);
        if (lm != null) {
            try { lm.removeUpdates(this); } catch (Exception ignored) {}
        }
        if (wl != null && wl.isHeld()) {
            try { wl.release(); } catch (Exception ignored) {}
        }
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
}
