package com.goweboficial.entregador;

import android.content.Context;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Textos nativos no idioma escolhido pelo entregador (o servidor manda "pt", "es" ou "en" a cada ping). */
final class L {
    private L() {}

    private static final Map<String, String[]> M = new HashMap<>();

    private static void put(String k, String pt, String es, String en) { M.put(k, new String[] { pt, es, en }); }

    static {
        put("ch_track", "Localização ao vivo", "Ubicación en vivo", "Live location");
        put("ch_jobs", "Entregas", "Entregas", "Deliveries");
        put("online_title", "Você está online", "Estás online", "You're online");
        put("sending", "Enviando sua localização para a loja", "Enviando tu ubicación a la tienda", "Sending your location to the store");
        put("sent_at", "Localização enviada às {t}", "Ubicación enviada a las {t}", "Location sent at {t}");
        put("no_net", "Sem internet — enviaremos quando o sinal voltar", "Sin internet — la enviamos cuando vuelva la señal", "No internet — we'll send it when the signal comes back");
        put("go_offline", "Ficar offline", "Ponerme offline", "Go offline");
        put("new_title", "Nova entrega #{n}", "Nueva entrega #{n}", "New delivery #{n}");
        put("new_body", "Toque para ver o endereço e a rota.", "Tocá para ver la dirección y la ruta.", "Tap to see the address and route.");
        put("open_title", "Entrega disponível #{n}", "Entrega disponible #{n}", "Delivery available #{n}");
        put("open_body", "Quem pegar primeiro leva. Toque para ver.", "El primero que la tome se la lleva. Tocá para ver.", "First to accept gets it. Tap to see.");
        put("session_title", "Sessão encerrada", "Sesión cerrada", "Signed out");
        put("session_body", "Abra o app e entre de novo com o link da loja.", "Abrí la app e ingresá de nuevo con el enlace de la tienda.", "Open the app and sign in again with the store's link.");
        put("resume_title", "Localização pausada", "Ubicación en pausa", "Location paused");
        put("resume_body", "Toque para voltar a enviar sua localização.", "Tocá para volver a enviar tu ubicación.", "Tap to start sending your location again.");
        put("offline_fail_title", "Sem internet", "Sin internet", "No internet");
        put("offline_fail_body", "Não deu para ficar offline. Tente pelo app.", "No se pudo pasar a offline. Probá desde la app.", "Couldn't go offline. Try from the app.");
        put("offline_page_title", "Sem conexão", "Sin conexión", "No connection");
        put("offline_page_body", "Confira a internet e tente de novo.", "Revisá la conexión e intentá de nuevo.", "Check your internet and try again.");
        put("retry", "Tentar de novo", "Reintentar", "Try again");
        put("ch_offer", "Corridas (tela cheia)", "Viajes (pantalla completa)", "New deliveries (full screen)");
        put("km_from_store", "{km} km da loja", "{km} km de la tienda", "{km} km from the store");
        put("accept", "Aceitar", "Aceptar", "Accept");
        put("claim", "Pegar entrega", "Tomar entrega", "Take delivery");
        put("decline", "Recusar", "Rechazar", "Decline");
        put("ignore", "Agora não", "Ahora no", "Not now");
        put("offer_cancelled", "A loja cancelou este pedido.", "La tienda canceló este pedido.", "The store canceled this order.");
        put("offer_missed", "Tempo esgotado.", "Se acabó el tiempo.", "Time's up.");
        put("offer_failed", "Não deu certo. Abra o app para conferir.", "No se pudo. Abrí la app para revisar.", "Something went wrong. Open the app to check.");
        put("no_net_short", "Sem internet.", "Sin internet.", "No internet.");
    }

    static String lang(Context c) {
        String dev = Locale.getDefault().getLanguage();
        String def = "es".equals(dev) || "en".equals(dev) ? dev : "pt";
        String l = Prefs.str(c, "lang", def);
        return "es".equals(l) || "en".equals(l) ? l : "pt";
    }

    static String t(Context c, String key) {
        String[] v = M.get(key);
        if (v == null) return key;
        String l = lang(c);
        return "en".equals(l) ? v[2] : "es".equals(l) ? v[1] : v[0];
    }
}
