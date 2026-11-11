package com.goweboficial.entregador;

import android.content.Context;
import android.os.Build;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

/**
 * Liga o token do Firebase deste aparelho ao entregador logado (POST /api/entregador/push { fcmToken }).
 * Sem google-services.json no build o Firebase não existe e tudo aqui vira "não faz nada".
 */
final class PushRegistrar {
    private PushRegistrar() {}

    /** Chame na thread principal (depois que a página carregou, quando o cookie de sessão já existe). */
    static void sync(final Context c) {
        final String cookie = Api.cookieHeader();
        if (!Api.hasSession(cookie)) return;
        try {
            if (FirebaseApp.getApps(c).isEmpty()) return;
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) return;
                final String token = task.getResult();
                Prefs.putStr(c, "fcmToken", token);
                final String key = token + "|" + Api.sessionKey(cookie);
                if (key.equals(Prefs.str(c, "pushReg", ""))) return;
                Bg.run(() -> {
                    try {
                        JSONObject b = new JSONObject();
                        b.put("fcmToken", token);
                        b.put("device", ("Android app · " + Build.MANUFACTURER + " " + Build.MODEL).trim());
                        Api.Res r = Api.send("POST", "/api/entregador/push", b.toString(), cookie);
                        if (r.code == 200) {
                            JSONObject j = r.json();
                            Prefs.putStr(c, "pushReg", key);
                            Prefs.putBool(c, "pushActive", j != null && j.optBoolean("fcm", false));
                        }
                    } catch (Exception ignored) {
                    }
                });
            });
        } catch (Throwable ignored) {
        }
    }

    /** Ao sair do celular: desliga os avisos deste aparelho (roda fora da thread principal). */
    static void unregister(Context c, String cookie) {
        String token = Prefs.str(c, "fcmToken", "");
        Prefs.putStr(c, "pushReg", "");
        Prefs.putBool(c, "pushActive", false);
        if (token.isEmpty() || !Api.hasSession(cookie)) return;
        try {
            JSONObject b = new JSONObject();
            b.put("fcmToken", token);
            b.put("remove", true);
            Api.send("POST", "/api/entregador/push", b.toString(), cookie);
        } catch (Exception ignored) {
        }
    }
}
