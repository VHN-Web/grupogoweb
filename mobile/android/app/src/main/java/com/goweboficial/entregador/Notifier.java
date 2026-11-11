package com.goweboficial.entregador;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/** Canais e notificações do app (aviso fixo do GPS + avisos de entrega). */
final class Notifier {
    private Notifier() {}

    static final String CH_TRACK = "rastreio";
    static final String CH_JOBS = "entregas";
    static final int ID_TRACK = 1001;
    private static final int COLOR = 0xFF3CC46B;

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel t = new NotificationChannel(CH_TRACK, L.t(c, "ch_track"), NotificationManager.IMPORTANCE_LOW);
        t.setShowBadge(false);
        nm.createNotificationChannel(t);
        NotificationChannel j = new NotificationChannel(CH_JOBS, L.t(c, "ch_jobs"), NotificationManager.IMPORTANCE_HIGH);
        j.enableVibration(true);
        j.setVibrationPattern(new long[] { 0, 400, 200, 400 });
        j.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(j);
    }

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    static PendingIntent open(Context c, String url, int req) {
        Intent i = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) i.putExtra("url", url);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Aviso fixo enquanto o GPS está ligado (exigido pelo Android para rodar com o app fechado). */
    static Notification tracking(Context c, String text) {
        Intent off = new Intent(c, ActionReceiver.class).setAction(ActionReceiver.OFFLINE);
        PendingIntent offPi = PendingIntent.getBroadcast(c, 2, off, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_TRACK)
                .setSmallIcon(R.drawable.ic_stat_moto)
                .setColor(COLOR)
                .setContentTitle(L.t(c, "online_title"))
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(open(c, null, 1))
                .addAction(0, L.t(c, "go_offline"), offPi);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    static void updateTracking(Context c, String text) {
        if (!canNotify(c)) return;
        try {
            NotificationManagerCompat.from(c).notify(ID_TRACK, tracking(c, text));
        } catch (SecurityException ignored) {
        }
    }

    /** Aviso de entrega (mesma `key` substitui o anterior, ex.: "livres-<loja>"). */
    static void show(Context c, String key, String title, String body, String url) {
        if (!canNotify(c)) return;
        int id = 2000 + (key.hashCode() & 0xffff);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_JOBS)
                .setSmallIcon(R.drawable.ic_stat_moto)
                .setColor(COLOR)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(open(c, url == null || url.isEmpty() ? "/entregador" : url, id));
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (SecurityException ignored) {
        }
    }

    /**
     * Compara a resposta do ping com a anterior e avisa entrega nova/livre.
     * Só quando o Firebase não está ativo (com Firebase o servidor já manda o aviso — evita duplicar).
     */
    static void diff(Context c, JSONObject j) {
        JSONArray mine = j.optJSONArray("mine");
        JSONArray open = j.optJSONArray("open");
        String prevMine = Prefs.str(c, "knownMine", null);
        String prevOpen = Prefs.str(c, "knownOpen", null);
        boolean push = Prefs.bool(c, "pushActive", false);
        if (!push && prevMine != null && mine != null) {
            for (int i = 0; i < mine.length(); i++) {
                JSONObject o = mine.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id");
                if (!prevMine.contains("," + id + ",")) {
                    Notifier.show(c, "mine-" + id, L.t(c, "new_title").replace("{n}", o.optString("n")), L.t(c, "new_body"), "/entregador");
                }
            }
        }
        if (!push && prevOpen != null && open != null) {
            String lastN = null;
            for (int i = 0; i < open.length(); i++) {
                JSONObject o = open.optJSONObject(i);
                if (o != null && !prevOpen.contains("," + o.optString("id") + ",")) lastN = o.optString("n");
            }
            if (lastN != null) Notifier.show(c, "livres", L.t(c, "open_title").replace("{n}", lastN), L.t(c, "open_body"), "/entregador");
        }
        if (mine != null) Prefs.putStr(c, "knownMine", ids(mine));
        if (open != null) Prefs.putStr(c, "knownOpen", ids(open));
    }

    private static String ids(JSONArray a) {
        StringBuilder sb = new StringBuilder(",");
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) sb.append(o.optString("id")).append(',');
        }
        return sb.toString();
    }
}
