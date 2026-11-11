package com.goweboficial.crm;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.concurrent.TimeUnit;

/**
 * A cada 15 min (e quando o app abre ou o ↻ do widget é tocado): busca /api/crm/app,
 * atualiza os widgets e mostra os avisos novos que devem tocar (preferências do sócio no servidor).
 * Com Firebase os avisos chegam na hora; aqui é a garantia quando ele não está configurado.
 */
public class SyncWorker extends Worker {
    public SyncWorker(Context context, WorkerParameters params) {
        super(context, params);
    }

    private static Constraints net() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static void schedule(Context c) {
        try {
            PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES).setConstraints(net()).build();
            WorkManager.getInstance(c).enqueueUniquePeriodicWork("crm-sync", ExistingPeriodicWorkPolicy.KEEP, r);
        } catch (Exception ignored) {
        }
    }

    static void now(Context c) {
        try {
            OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(net()).build();
            WorkManager.getInstance(c).enqueueUniqueWork("crm-sync-now", ExistingWorkPolicy.REPLACE, r);
        } catch (Exception ignored) {
        }
    }

    @Override
    public Result doWork() {
        return run(getApplicationContext()) ? Result.success() : Result.retry();
    }

    static boolean run(Context c) {
        String cookie = Api.cookieFromAnyThread();
        if (!Api.hasSession(cookie)) {
            Prefs.putStr(c, "widget", "");
            Widgets.updateAll(c, false);
            return true;
        }
        String since = Prefs.str(c, "since", "");
        String path = "/api/crm/app";
        try {
            if (!since.isEmpty()) path += "?since=" + URLEncoder.encode(since, "UTF-8");
        } catch (Exception ignored) {
        }
        Api.Res r = Api.send("GET", path, null, cookie);
        if (r.code == 401) {
            Notifier.live(c, "");
            Prefs.putStr(c, "widget", "");
            Widgets.updateAll(c, false);
            return true;
        }
        JSONObject j = r.code == 200 ? r.json() : null;
        if (j == null) {
            Widgets.updateAll(c, false);
            return false;
        }
        JSONObject w = j.optJSONObject("widget");
        if (w != null) Prefs.putStr(c, "widget", w.toString());
        Prefs.putLng(c, "lastSync", System.currentTimeMillis());
        JSONArray ns = j.optJSONArray("notifications");
        // na 1ª vez só marca o ponto de partida (não despeja avisos antigos)
        if (ns != null && !since.isEmpty()) {
            for (int i = ns.length() - 1; i >= 0; i--) {
                JSONObject n = ns.optJSONObject(i);
                if (n == null || !n.optBoolean("ring", true)) continue;
                Notifier.show(c, n.optString("id"), n.optString("category"), n.optString("title"), n.optString("body"), n.optString("url"));
            }
        }
        // "ao vivo": compromisso/lembrete chegando ou jornada rodando → notificação fixa com cronômetro
        JSONObject live = j.optJSONObject("live");
        String liveKey = live == null ? "" : live.optString("kind") + ":" + live.optString("id") + ":" + live.optLong("at", live.optLong("since", 0)) + ":" + live.optBoolean("paused", false);
        if (!liveKey.equals(Prefs.str(c, "liveKey", "-"))) {
            Prefs.putStr(c, "liveKey", liveKey);
            Notifier.live(c, live == null ? "" : live.toString());
        }
        String now = j.optString("now", "");
        if (!now.isEmpty()) Prefs.putStr(c, "since", now);
        Widgets.updateAll(c, false);
        return true;
    }
}
