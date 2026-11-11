package com.goweboficial.crm;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Desenha os widgets "Hoje no CRM" e "Acessos" com os números guardados pela última busca. */
final class Widgets {
    private Widgets() {}

    static final String REFRESH = "com.goweboficial.crm.REFRESH";

    static void updateAll(Context c, boolean loading) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m == null) return;
        JSONObject w = null;
        try {
            String raw = Prefs.str(c, "widget", "");
            if (!raw.isEmpty()) w = new JSONObject(raw);
        } catch (Exception ignored) {
        }
        for (int id : m.getAppWidgetIds(new ComponentName(c, SummaryWidget.class))) m.updateAppWidget(id, summary(c, w, loading));
        for (int id : m.getAppWidgetIds(new ComponentName(c, VisitsWidget.class))) m.updateAppWidget(id, visits(c, w, loading));
    }

    private static PendingIntent open(Context c, String url, int req) {
        Intent i = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("url", url);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent refresh(Context c, Class<?> provider, int req) {
        Intent i = new Intent(c, provider).setAction(REFRESH);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String footer(Context c, JSONObject w, boolean loading, String extra) {
        if (loading) return "Atualizando…";
        if (w == null) return "Abra o app e entre para ver seus números";
        long t = Prefs.lng(c, "lastSync", 0);
        String at = t > 0 ? new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)) : "—";
        return (extra.isEmpty() ? "" : extra + " · ") + "atualizado " + at;
    }

    private static String num(JSONObject o, String k) {
        return o == null ? "–" : String.valueOf(o.optInt(k, 0));
    }

    static RemoteViews summary(Context c, JSONObject w, boolean loading) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_summary);
        String name = w == null ? "" : w.optString("name", "");
        v.setTextViewText(R.id.w_title, name.isEmpty() ? "Hoje no CRM" : "Hoje no CRM · " + name);
        v.setTextViewText(R.id.s_followups, num(w, "followUps"));
        v.setTextViewText(R.id.s_leads, num(w, "newLeads"));
        v.setTextViewText(R.id.s_contacts, w == null ? "–" : w.optInt("contacts", 0) + "/" + w.optInt("goal", 0));
        v.setTextViewText(R.id.s_demos, num(w, "demos"));
        int unread = w == null ? 0 : w.optInt("unread", 0);
        int tickets = w == null ? 0 : w.optInt("tickets", 0);
        String extra = (unread > 0 ? unread + (unread == 1 ? " aviso novo" : " avisos novos") : "") + (tickets > 0 ? (unread > 0 ? " · " : "") + tickets + " chamado(s)" : "");
        v.setTextViewText(R.id.w_footer, footer(c, w, loading, extra));
        v.setOnClickPendingIntent(R.id.w_root, open(c, unread > 0 ? "/crm/avisos" : "/crm", 11));
        v.setOnClickPendingIntent(R.id.w_refresh, refresh(c, SummaryWidget.class, 12));
        return v;
    }

    static RemoteViews visits(Context c, JSONObject w, boolean loading) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_visits);
        JSONObject vs = w == null ? null : w.optJSONObject("visits");
        setArea(v, vs, "site", R.id.v_site, R.id.v_site_label, "Site oficial");
        setArea(v, vs, "afiliados", R.id.v_aff, R.id.v_aff_label, "Pág. afiliados");
        setArea(v, vs, "link", R.id.v_link, R.id.v_link_label, "Links afiliados");
        v.setTextViewText(R.id.w_footer, footer(c, w, loading, ""));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/crm/acessos", 21));
        v.setOnClickPendingIntent(R.id.w_refresh, refresh(c, VisitsWidget.class, 22));
        return v;
    }

    private static void setArea(RemoteViews v, JSONObject vs, String key, int numId, int labelId, String label) {
        JSONObject a = vs == null ? null : vs.optJSONObject(key);
        if (a == null) {
            v.setTextViewText(numId, "–");
            v.setTextViewText(labelId, label);
            return;
        }
        int today = a.optInt("today", 0);
        int yesterday = a.optInt("yesterday", 0);
        v.setTextViewText(numId, String.valueOf(today));
        v.setTextViewText(labelId, label + " · ontem " + yesterday);
    }
}
