package com.goweboficial.entregador;

import android.content.Context;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Textos das notificações nativas no idioma da loja (o servidor manda "pt" ou "es" a cada ping). */
final class L {
    private L() {}

    private static final Map<String, String[]> M = new HashMap<>();

    private static void put(String k, String pt, String es) { M.put(k, new String[] { pt, es }); }

    static {
        put("ch_track", "Localização ao vivo", "Ubicación en vivo");
        put("ch_jobs", "Entregas", "Entregas");
        put("online_title", "Você está online", "Estás online");
        put("sending", "Enviando sua localização para a loja", "Enviando tu ubicación a la tienda");
        put("sent_at", "Localização enviada às {t}", "Ubicación enviada a las {t}");
        put("no_net", "Sem internet — enviaremos quando o sinal voltar", "Sin internet — la enviamos cuando vuelva la señal");
        put("go_offline", "Ficar offline", "Ponerme offline");
        put("new_title", "Nova entrega #{n}", "Nueva entrega #{n}");
        put("new_body", "Toque para ver o endereço e a rota.", "Tocá para ver la dirección y la ruta.");
        put("open_title", "Entrega disponível #{n}", "Entrega disponible #{n}");
        put("open_body", "Quem pegar primeiro leva. Toque para ver.", "El primero que la tome se la lleva. Tocá para ver.");
        put("session_title", "Sessão encerrada", "Sesión cerrada");
        put("session_body", "Abra o app e entre de novo com o link da loja.", "Abrí la app e ingresá de nuevo con el enlace de la tienda.");
        put("resume_title", "Localização pausada", "Ubicación en pausa");
        put("resume_body", "Toque para voltar a enviar sua localização.", "Tocá para volver a enviar tu ubicación.");
        put("offline_fail_title", "Sem internet", "Sin internet");
        put("offline_fail_body", "Não deu para ficar offline. Tente pelo app.", "No se pudo pasar a offline. Probá desde la app.");
        put("offline_page_title", "Sem conexão", "Sin conexión");
        put("offline_page_body", "Confira a internet e tente de novo.", "Revisá la conexión e intentá de nuevo.");
        put("retry", "Tentar de novo", "Reintentar");
        put("ch_offer", "Corridas (tela cheia)", "Viajes (pantalla completa)");
        put("km_from_store", "{km} km da loja", "{km} km de la tienda");
        put("accept", "Aceitar", "Aceptar");
        put("claim", "Pegar entrega", "Tomar entrega");
        put("decline", "Recusar", "Rechazar");
        put("ignore", "Agora não", "Ahora no");
        put("offer_cancelled", "A loja cancelou este pedido.", "La tienda canceló este pedido.");
        put("offer_missed", "Tempo esgotado.", "Se acabó el tiempo.");
        put("offer_failed", "Não deu certo. Abra o app para conferir.", "No se pudo. Abrí la app para revisar.");
        put("no_net_short", "Sem internet.", "Sin internet.");
    }

    static String lang(Context c) {
        String def = "es".equals(Locale.getDefault().getLanguage()) ? "es" : "pt";
        return Prefs.str(c, "lang", def);
    }

    static String t(Context c, String key) {
        String[] v = M.get(key);
        if (v == null) return key;
        return "es".equals(lang(c)) ? v[1] : v[0];
    }
}
