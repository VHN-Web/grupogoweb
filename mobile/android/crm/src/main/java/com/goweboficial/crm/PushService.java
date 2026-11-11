package com.goweboficial.crm;

import android.os.Handler;
import android.os.Looper;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Avisos do servidor pelo Firebase: chegam na hora, com o app fechado, no canal do tipo de aviso. */
public class PushService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        Prefs.putStr(this, "fcmToken", token);
        Prefs.putStr(this, "pushReg", "");
        new Handler(Looper.getMainLooper()).post(() -> PushRegistrar.sync(getApplicationContext()));
    }

    @Override
    public void onMessageReceived(RemoteMessage m) {
        Map<String, String> d = m.getData();
        String title = d.get("title");
        String body = d.get("body");
        if (title == null && m.getNotification() != null) {
            title = m.getNotification().getTitle();
            body = m.getNotification().getBody();
        }
        if (title == null) return;
        Notifier.show(this, d.get("nid"), d.get("category"), title, body == null ? "" : body, d.get("url"));
        SyncWorker.now(this); // atualiza os números dos widgets
    }
}
