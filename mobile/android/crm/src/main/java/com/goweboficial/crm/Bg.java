package com.goweboficial.crm;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Uma fila em segundo plano para as chamadas de rede (nunca na thread da tela). */
final class Bg {
    private Bg() {}
    private static final ExecutorService EX = Executors.newSingleThreadExecutor();
    static void run(Runnable r) { EX.execute(r); }
}
