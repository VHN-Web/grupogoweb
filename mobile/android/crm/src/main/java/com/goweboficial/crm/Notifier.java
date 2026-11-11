package com.goweboficial.crm;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Um canal por tipo de aviso (core/crm-notify.ts): cada sócio escolhe som, vibração e tela bloqueada
 * de cada um nas configurações do Android (atalho em CRM → App e notificações).
 */
final class Notifier {
    private Notifier() {}

    static final String[][] CHANNELS = {
            // id, nome, descrição, importância (h = alta, d = normal)
            { "vendas", "Vendas", "Contrato novo e implantação paga", "h" },
            { "suporte", "Suporte", "Chamado novo de lojista", "h" },
            { "leads", "Leads novos", "Busca automática, lista de espera e leads passados para você", "h" },
            { "retornos", "Retornos", "Retorno marcado chegou na hora", "h" },
            { "demos", "Demonstrações", "Demo agendada por afiliado ou pela Geovana", "h" },
            { "whatsapp", "WhatsApp da GoWeb", "Geovana pediu humano ou lead esquentando", "h" },
            { "afiliados", "Afiliados", "Cadastro e indicações de afiliados", "d" },
            { "acessos", "Acessos", "Resumo de visitas do site e da página de afiliados", "d" },
            { "homologacao", "Homologação", "Mudança nova para aprovar, testes concluídos e decisões", "d" },
            { "agenda", "Agenda", "Compromisso chegando", "h" },
            { "lembretes", "Lembretes", "Lembretes que você marcou", "h" },
            { "geral", "Outros avisos", "Testes e avisos gerais", "d" },
    };

    static String channelFor(String category) {
        if (category != null) for (String[] c : CHANNELS) if (c[0].equals(category)) return c[0];
        return "geral";
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        nm.createNotificationChannelGroup(new NotificationChannelGroup("crm", "Avisos do CRM"));
        for (String[] ch : CHANNELS) {
            NotificationChannel n = new NotificationChannel(ch[0], ch[1], "h".equals(ch[3]) ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT);
            n.setDescription(ch[2]);
            n.setGroup("crm");
            n.enableVibration(true);
            n.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            nm.createNotificationChannel(n);
        }
        // "ao vivo": compromisso/jornada com cronômetro, fixo e silencioso (como o cronômetro do relógio)
        NotificationChannel live = new NotificationChannel(LIVE_CHANNEL, "Ao vivo (cronômetro)", NotificationManager.IMPORTANCE_LOW);
        live.setDescription("Compromisso acontecendo ou chegando, lembrete próximo e jornada de trabalho");
        live.setGroup("crm");
        live.setShowBadge(false);
        live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(live);
    }

    static final String LIVE_CHANNEL = "ao_vivo";
    static final int LIVE_ID = 3999;

    /**
     * Notificação "ao vivo" (equivalente Android à Dynamic Island): fica fixa no topo com cronômetro regressivo
     * até o compromisso/lembrete, ou progressivo na jornada. No Android 16 pede para virar chip na barra de status.
     * json vazio = some.
     */
    static void live(Context c, String json) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        org.json.JSONObject l = null;
        try {
            if (json != null && !json.isEmpty()) l = new org.json.JSONObject(json);
        } catch (Exception ignored) {
        }
        if (l == null) {
            nm.cancel(LIVE_ID);
            return;
        }
        if (!canNotify(c)) return;
        channels(c);
        String kind = l.optString("kind", "");
        boolean paused = l.optBoolean("paused", false);
        long now = System.currentTimeMillis();
        long target;
        String text;
        boolean down = true;
        switch (kind) {
            case "event_now":
                target = l.optLong("until", now);
                text = "Acontecendo agora · termina em";
                break;
            case "event_soon":
                target = l.optLong("at", now);
                text = "Começa em";
                break;
            case "reminder_soon":
                target = l.optLong("at", now);
                text = "Lembrete em";
                break;
            default:
                target = l.optLong("since", now);
                text = paused ? "Jornada em pausa" : "Jornada de trabalho";
                down = false;
        }
        Intent i = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("url", l.optString("url", "/crm"));
        PendingIntent pi = PendingIntent.getActivity(c, LIVE_ID, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = l.optString("title", "GoWeb CRM");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, LIVE_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_crm)
                .setColor(0xFF3CC46B)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(true)
                .setWhen(target)
                .setUsesChronometer(!paused)
                .setChronometerCountDown(down)
                .setCategory(down ? NotificationCompat.CATEGORY_EVENT : NotificationCompat.CATEGORY_STOPWATCH)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pi);
        // some sozinha quando o compromisso acaba / o lembrete passa (a jornada fica até encerrar)
        if (down) b.setTimeoutAfter(Math.max(60_000L, target - now + 5 * 60_000L));
        android.os.Bundle ex = new android.os.Bundle();
        ex.putBoolean("android.requestPromotedOngoing", true); // Notification.EXTRA_REQUEST_PROMOTED_ONGOING (Android 16)
        ex.putString("android.shortCriticalText", down ? "em breve" : "jornada"); // texto do chip na barra de status
        b.addExtras(ex);
        try {
            nm.notify(LIVE_ID, b.build());
        } catch (SecurityException ignored) {
        }
    }

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    /** Já mostrou este aviso? (o Firebase e a busca a cada 15 min podem trazer o mesmo) */
    private static synchronized boolean firstTime(Context c, String nid) {
        if (nid == null || nid.isEmpty()) return true;
        String seen = Prefs.str(c, "shown", ",");
        if (seen.contains("," + nid + ",")) return false;
        String[] ids = (seen + nid).split(",");
        StringBuilder sb = new StringBuilder(",");
        for (int k = Math.max(0, ids.length - 80); k < ids.length; k++) if (!ids[k].isEmpty()) sb.append(ids[k]).append(',');
        Prefs.putStr(c, "shown", sb.toString());
        return true;
    }

    static void show(Context c, String nid, String category, String title, String body, String url) {
        if (!firstTime(c, nid) || !canNotify(c)) return;
        channels(c);
        int id = 4000 + ((nid == null || nid.isEmpty() ? String.valueOf(System.currentTimeMillis()) : nid).hashCode() & 0xffff);
        Intent i = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("url", url == null || url.isEmpty() ? "/crm/avisos" : url);
        PendingIntent pi = PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, channelFor(category))
                .setSmallIcon(R.drawable.ic_stat_crm)
                .setColor(0xFF3CC46B)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setGroup("crm-" + channelFor(category))
                .setContentIntent(pi);
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (SecurityException ignored) {
        }
    }
}
