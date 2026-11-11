package com.goweboficial.crm;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import android.view.View;

import org.json.JSONArray;
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
        for (int id : m.getAppWidgetIds(new ComponentName(c, AgendaWidget.class))) m.updateAppWidget(id, agenda(c, w, loading));
        for (int id : m.getAppWidgetIds(new ComponentName(c, RemindersWidget.class))) m.updateAppWidget(id, reminders(c, w, loading));
        for (int id : m.getAppWidgetIds(new ComponentName(c, NoteWidget.class))) m.updateAppWidget(id, note(c, w, loading));
        for (int id : m.getAppWidgetIds(new ComponentName(c, FunnelWidget.class))) m.updateAppWidget(id, funnel(c, w, loading));
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

    private static final int[][] ROWS = {
            { R.id.r1, R.id.r1_when, R.id.r1_text },
            { R.id.r2, R.id.r2_when, R.id.r2_text },
            { R.id.r3, R.id.r3_when, R.id.r3_text },
            { R.id.r4, R.id.r4_when, R.id.r4_text },
    };

    /** Lista de até 4 linhas (quando · texto); vazio = mensagem no meio. */
    private static void fillRows(RemoteViews v, JSONArray arr, String whenKey, String textKey, String empty, int lateColor) {
        int n = arr == null ? 0 : Math.min(4, arr.length());
        for (int k = 0; k < 4; k++) {
            JSONObject o = k < n ? arr.optJSONObject(k) : null;
            if (o == null) {
                v.setViewVisibility(ROWS[k][0], View.GONE);
                continue;
            }
            v.setViewVisibility(ROWS[k][0], View.VISIBLE);
            v.setTextViewText(ROWS[k][1], o.optString(whenKey, ""));
            v.setTextViewText(ROWS[k][2], o.optString(textKey, ""));
            if (o.optBoolean("late", false)) v.setTextColor(ROWS[k][1], lateColor);
        }
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, empty);
    }

    static RemoteViews agenda(Context c, JSONObject w, boolean loading) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        v.setTextViewText(R.id.w_title, "Agenda");
        fillRows(v, w == null ? null : w.optJSONArray("agenda"), "when", "title", w == null ? "Abra o app e entre" : "Agenda livre nos próximos dias", 0xFFE05A47);
        v.setTextViewText(R.id.w_footer, footer(c, w, loading, ""));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/crm/agenda", 31));
        v.setOnClickPendingIntent(R.id.w_refresh, refresh(c, AgendaWidget.class, 32));
        return v;
    }

    static RemoteViews reminders(Context c, JSONObject w, boolean loading) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        v.setTextViewText(R.id.w_title, "Lembretes");
        fillRows(v, w == null ? null : w.optJSONArray("reminders"), "when", "text", w == null ? "Abra o app e entre" : "Nenhum lembrete pela frente", 0xFFE05A47);
        v.setTextViewText(R.id.w_footer, footer(c, w, loading, ""));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/crm/lembretes", 41));
        v.setOnClickPendingIntent(R.id.w_refresh, refresh(c, RemindersWidget.class, 42));
        return v;
    }

    static RemoteViews note(Context c, JSONObject w, boolean loading) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_note);
        JSONObject n = w == null ? null : w.optJSONObject("note");
        v.setTextViewText(R.id.w_title, n == null ? "Nota fixada" : n.optString("title", "Nota fixada"));
        String body = n == null ? (w == null ? "Abra o app e entre" : "Fixe uma nota no CRM para ela aparecer aqui.") : n.optString("body", "")
                .replace("- [ ] ", "☐ ").replace("- [x] ", "☑ ").replace("- [X] ", "☑ ");
        v.setTextViewText(R.id.n_body, loading ? "Atualizando…" : body);
        v.setOnClickPendingIntent(R.id.w_root, open(c, n == null ? "/crm/notas" : "/crm/notas?abrir=" + n.optString("id"), 51));
        v.setOnClickPendingIntent(R.id.n_body, open(c, n == null ? "/crm/notas" : "/crm/notas?abrir=" + n.optString("id"), 52));
        v.setOnClickPendingIntent(R.id.n_new, open(c, "/crm/notas?nova=1", 53));
        v.setOnClickPendingIntent(R.id.n_rem, open(c, "/crm/lembretes", 54));
        v.setOnClickPendingIntent(R.id.n_ev, open(c, "/crm/agenda?novo=1#form", 55));
        v.setOnClickPendingIntent(R.id.w_refresh, refresh(c, NoteWidget.class, 56));
        return v;
    }

    static RemoteViews funnel(Context c, JSONObject w, boolean loading) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_funnel);
        JSONObject f = w == null ? null : w.optJSONObject("funnel");
        v.setTextViewText(R.id.f_new, num(f, "NEW"));
        v.setTextViewText(R.id.f_contact, num(f, "CONTACT"));
        v.setTextViewText(R.id.f_demo, num(f, "DEMO"));
        v.setTextViewText(R.id.f_prop, num(f, "PROPOSAL"));
        v.setTextViewText(R.id.f_won, num(f, "WON"));
        int done = w == null ? 0 : w.optInt("contacts", 0);
        int goal = w == null ? 0 : w.optInt("goal", 0);
        int pct = goal > 0 ? Math.min(100, Math.round(done * 100f / goal)) : 0;
        v.setTextViewText(R.id.f_goal, w == null ? "Meta de contatos" : "Meta de contatos: " + done + " de " + goal + (pct >= 100 ? " · batida!" : ""));
        v.setProgressBar(R.id.f_bar, 100, pct, false);
        v.setTextViewText(R.id.w_footer, footer(c, w, loading, ""));
        v.setOnClickPendingIntent(R.id.w_root, open(c, "/crm/funil", 61));
        v.setOnClickPendingIntent(R.id.w_refresh, refresh(c, FunnelWidget.class, 62));
        return v;
    }
}
