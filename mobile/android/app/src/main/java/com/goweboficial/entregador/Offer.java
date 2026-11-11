package com.goweboficial.entregador;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.util.Map;

/**
 * Corrida oferecida ao entregador ("Nova entrega"). Vem do ping (motoboy online) ou do Firebase.
 * show() abre a tela cheia por cima de qualquer app (permissão "Aparecer sobre outros apps") e,
 * com a tela bloqueada, pela notificação de tela cheia — igual chamada/iFood.
 */
final class Offer {
    static final int SECONDS = 30;

    String id = "";
    String n = "";
    String type = "mine";
    String addr = "";
    String km = "";
    String fee = "";
    String store = "";
    boolean auto;

    boolean mine() { return !"open".equals(type); }

    static Offer fromJson(JSONObject o, String type, String store) {
        if (o == null) return null;
        Offer f = new Offer();
        f.id = o.optString("orderId", o.optString("id", ""));
        f.n = o.optString("n", "");
        f.type = type;
        f.addr = o.optString("addr", "");
        f.km = o.optString("km", "");
        f.fee = o.optString("fee", "");
        f.store = o.optString("store", store == null ? "" : store);
        Object a = o.opt("auto");
        f.auto = Boolean.TRUE.equals(a) || "1".equals(String.valueOf(a)) || "true".equals(String.valueOf(a));
        return f.id.isEmpty() ? null : f;
    }

    static Offer fromData(Map<String, String> d) {
        Offer f = new Offer();
        f.id = val(d, "orderId");
        f.n = val(d, "n");
        f.type = "open".equals(d.get("type")) ? "open" : "mine";
        f.addr = val(d, "addr");
        f.km = val(d, "km");
        f.fee = val(d, "fee");
        f.store = val(d, "store");
        f.auto = "1".equals(d.get("auto"));
        return f.id.isEmpty() ? null : f;
    }

    private static String val(Map<String, String> d, String k) {
        String v = d.get(k);
        return v == null ? "" : v;
    }

    void put(Intent i) {
        i.putExtra("o_id", id).putExtra("o_n", n).putExtra("o_type", type).putExtra("o_addr", addr)
                .putExtra("o_km", km).putExtra("o_fee", fee).putExtra("o_store", store).putExtra("o_auto", auto);
    }

    static Offer from(Intent i) {
        if (i == null || i.getStringExtra("o_id") == null) return null;
        Offer f = new Offer();
        f.id = i.getStringExtra("o_id");
        f.n = nz(i.getStringExtra("o_n"));
        f.type = nz(i.getStringExtra("o_type"));
        f.addr = nz(i.getStringExtra("o_addr"));
        f.km = nz(i.getStringExtra("o_km"));
        f.fee = nz(i.getStringExtra("o_fee"));
        f.store = nz(i.getStringExtra("o_store"));
        f.auto = i.getBooleanExtra("o_auto", false);
        return f;
    }

    private static String nz(String s) { return s == null ? "" : s; }

    static int notifId(String orderId) { return 3000 + (orderId.hashCode() & 0xffff); }

    // ---------- permissões ----------

    static boolean canOverlay(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    static boolean canFullScreen(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        return nm == null || nm.canUseFullScreenIntent();
    }

    // ---------- mostrar ----------

    /** Já ofereceu essa corrida? (o ping e o Firebase podem avisar a mesma) */
    private static synchronized boolean firstTime(Context c, String id) {
        String seen = Prefs.str(c, "offered", ",");
        if (seen.contains("," + id + ",")) return false;
        String[] ids = (seen + id).split(",");
        StringBuilder sb = new StringBuilder(",");
        for (int k = Math.max(0, ids.length - 60); k < ids.length; k++) {
            if (!ids[k].isEmpty()) sb.append(ids[k]).append(',');
        }
        Prefs.putStr(c, "offered", sb.toString());
        return true;
    }

    static void show(Context c, Offer o) {
        if (o == null || !firstTime(c, o.id)) return;
        Notifier.channels(c);
        Intent i = IncomingActivity.intent(c, o);
        PendingIntent full = PendingIntent.getActivity(c, notifId(o.id), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = L.t(c, o.mine() ? "new_title" : "open_title").replace("{n}", o.n);
        StringBuilder body = new StringBuilder();
        if (!o.fee.isEmpty()) body.append(o.fee);
        if (!o.km.isEmpty()) body.append(body.length() > 0 ? " · " : "").append(o.km).append(" km");
        if (!o.addr.isEmpty()) body.append(body.length() > 0 ? " · " : "").append(o.addr);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, Notifier.CH_OFFER)
                .setSmallIcon(R.drawable.ic_stat_moto)
                .setColor(0xFF3CC46B)
                .setContentTitle(title)
                .setContentText(body.toString())
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body.toString()))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setTimeoutAfter((SECONDS + 5) * 1000L)
                .setContentIntent(full)
                .setFullScreenIntent(full, true);
        if (Notifier.canNotify(c)) {
            try {
                NotificationManagerCompat.from(c).notify(notifId(o.id), b.build());
            } catch (SecurityException ignored) {
            }
        }
        // por cima do Instagram, WhatsApp, Waze...: abre direto a tela da corrida
        if (canOverlay(c)) {
            try {
                c.startActivity(i);
            } catch (Exception ignored) {
            }
        }
    }

    /** Pedido cancelado: fecha a tela e tira o aviso. */
    static void cancel(Context c, String orderId) {
        if (orderId == null || orderId.isEmpty()) return;
        NotificationManagerCompat.from(c).cancel(notifId(orderId));
        IncomingActivity.closeIfShowing(orderId);
    }

}
