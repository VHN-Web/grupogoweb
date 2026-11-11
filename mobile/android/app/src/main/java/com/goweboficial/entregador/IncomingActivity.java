package com.goweboficial.entregador;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.lang.ref.WeakReference;

/** Tela cheia "Nova entrega" (estilo iFood): toca e vibra até aceitar, recusar ou acabar o tempo. */
public class IncomingActivity extends Activity {
    private static WeakReference<IncomingActivity> current = new WeakReference<>(null);

    private Offer offer;
    private MediaPlayer player;
    private Vibrator vib;
    private CountDownTimer timer;
    private boolean busy;
    private final Handler h = new Handler(Looper.getMainLooper());

    private TextView title, store, fee, km, addr, countdown, msg;
    private ProgressBar bar;
    private Button accept, decline;

    static Intent intent(Context c, Offer o) {
        Intent i = new Intent(c, IncomingActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        o.put(i);
        return i;
    }

    static void closeIfShowing(String orderId) {
        IncomingActivity a = current.get();
        if (a != null && a.offer != null && orderId.equals(a.offer.id)) a.runOnUiThread(() -> a.close(L.t(a, "offer_cancelled")));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_incoming);
        title = findViewById(R.id.offer_title);
        store = findViewById(R.id.offer_store);
        fee = findViewById(R.id.offer_fee);
        km = findViewById(R.id.offer_km);
        addr = findViewById(R.id.offer_addr);
        countdown = findViewById(R.id.offer_countdown);
        msg = findViewById(R.id.offer_msg);
        bar = findViewById(R.id.offer_bar);
        accept = findViewById(R.id.offer_accept);
        decline = findViewById(R.id.offer_decline);
        accept.setOnClickListener(v -> onAccept());
        decline.setOnClickListener(v -> onDecline());
        bind(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bind(intent); // chegou outra corrida: mostra a mais nova
    }

    private void bind(Intent i) {
        Offer o = Offer.from(i);
        if (o == null) {
            finish();
            return;
        }
        offer = o;
        busy = false;
        current = new WeakReference<>(this);
        NotificationManagerCompat.from(this).cancel(Offer.notifId(o.id));

        title.setText(L.t(this, o.mine() ? "new_title" : "open_title").replace("{n}", o.n));
        store.setText(o.store);
        store.setVisibility(o.store.isEmpty() ? View.GONE : View.VISIBLE);
        fee.setText(o.fee);
        fee.setVisibility(o.fee.isEmpty() ? View.GONE : View.VISIBLE);
        String kmText = "en".equals(L.lang(this)) ? o.km : o.km.replace('.', ',');
        km.setText(o.km.isEmpty() ? "" : L.t(this, "km_from_store").replace("{km}", kmText));
        km.setVisibility(o.km.isEmpty() ? View.GONE : View.VISIBLE);
        addr.setText(o.addr);
        addr.setVisibility(o.addr.isEmpty() ? View.GONE : View.VISIBLE);
        msg.setVisibility(View.GONE);
        accept.setText(L.t(this, o.mine() ? "accept" : "claim"));
        decline.setText(L.t(this, o.mine() ? "decline" : "ignore"));
        accept.setEnabled(true);
        decline.setEnabled(true);

        startAlert();
        startTimer();
    }

    // ---------- som e vibração ----------

    private void startAlert() {
        stopAlert();
        try {
            Uri u = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, u);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            player = null;
        }
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vib = vm == null ? null : vm.getDefaultVibrator();
            } else {
                vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            long[] pattern = { 0, 700, 500 };
            if (vib != null) {
                if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else vib.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {
        }
    }

    private void stopAlert() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
        if (vib != null) {
            try { vib.cancel(); } catch (Exception ignored) {}
        }
    }

    private void startTimer() {
        if (timer != null) timer.cancel();
        final long total = Offer.SECONDS * 1000L;
        bar.setMax(1000);
        timer = new CountDownTimer(total, 200) {
            @Override public void onTick(long left) {
                bar.setProgress((int) (left * 1000 / total));
                countdown.setText(String.valueOf((left + 999) / 1000));
            }
            @Override public void onFinish() {
                bar.setProgress(0);
                countdown.setText("0");
                onTimeout();
            }
        }.start();
    }

    // ---------- ações ----------

    private void onAccept() {
        if (busy || offer == null) return;
        if (offer.mine()) {
            // já é dele: só abre o app na entrega
            openApp();
            return;
        }
        send("claim", true);
    }

    private void onDecline() {
        if (busy || offer == null) return;
        if (offer.mine()) send("decline", false);
        else close(null);
    }

    /** Ninguém respondeu: se o sistema escolheu ele, passa para o próximo motoboy (igual iFood). */
    private void onTimeout() {
        if (offer != null && offer.mine() && offer.auto) send("decline", false);
        else close(L.t(this, "offer_missed"));
    }

    private void send(final String action, final boolean openAfter) {
        busy = true;
        stopAlert();
        if (timer != null) timer.cancel();
        accept.setEnabled(false);
        decline.setEnabled(false);
        final String cookie = Api.cookieHeader();
        final String orderId = offer.id;
        Bg.run(() -> {
            JSONObject b = new JSONObject();
            try {
                b.put("orderId", orderId);
                b.put("action", action);
            } catch (Exception ignored) {
            }
            final Api.Res r = Api.hasSession(cookie) ? Api.send("POST", "/api/entregador/oferta", b.toString(), cookie) : new Api.Res(401, "");
            h.post(() -> {
                if (isFinishing()) return;
                if (r.code == 200) {
                    if (openAfter) openApp();
                    else close(null);
                    return;
                }
                JSONObject j = r.json();
                String err = j != null ? j.optString("error", "") : "";
                if (r.code == -1) err = L.t(this, "no_net_short");
                if (err.isEmpty() || r.code == 401) err = L.t(this, "offer_failed");
                close(err);
            });
        });
    }

    private void close(String message) {
        stopAlert();
        if (timer != null) timer.cancel();
        if (message == null || message.isEmpty()) {
            finish();
            return;
        }
        busy = true;
        accept.setEnabled(false);
        decline.setEnabled(false);
        msg.setText(message);
        msg.setVisibility(View.VISIBLE);
        h.postDelayed(() -> finish(), 2500);
    }

    private void openApp() {
        stopAlert();
        if (timer != null) timer.cancel();
        final Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("url", "/entregador");
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && km != null && km.isKeyguardLocked()) {
            km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() {
                    startActivity(i);
                    finish();
                }
            });
            return;
        }
        startActivity(i);
        finish();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // voltar = fechar sem responder (a corrida continua no app)
        close(null);
    }

    @Override
    protected void onDestroy() {
        stopAlert();
        if (timer != null) timer.cancel();
        h.removeCallbacksAndMessages(null);
        if (current.get() == this) current = new WeakReference<>(null);
        super.onDestroy();
    }
}
