package com.goweboficial.entregador;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import android.os.Handler;
import android.os.Looper;

import java.util.Map;

/** Notificações do servidor pelo Firebase: chegam com o app fechado e o motoboy offline. */
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
        String tag = d.get("tag");
        String key = tag != null && !tag.isEmpty() ? tag : "push-" + System.currentTimeMillis();
        Notifier.channels(this);
        Notifier.show(this, key, title, body == null ? "" : body, d.get("url"));
    }
}
