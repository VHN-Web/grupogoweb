package com.goweboficial.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

/** Botão "Ficar offline" do aviso fixo: avisa o servidor e desliga o GPS sem abrir o app. */
public class ActionReceiver extends BroadcastReceiver {
    static final String OFFLINE = "com.goweboficial.entregador.OFFLINE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !OFFLINE.equals(intent.getAction())) return;
        final Context app = context.getApplicationContext();
        final String cookie = Api.cookieHeader();
        final PendingResult pr = goAsync();
        Bg.run(() -> {
            final Api.Res r = Api.hasSession(cookie) ? Api.send("POST", "/api/entregador/status", "{\"online\":false}", cookie) : new Api.Res(401, "");
            new Handler(Looper.getMainLooper()).post(() -> {
                if (r.code == 200 || r.code == 401) LocationService.stop(app);
                else Notifier.show(app, "offline-falhou", L.t(app, "offline_fail_title"), L.t(app, "offline_fail_body"), "/entregador");
                pr.finish();
            });
        });
    }
}
