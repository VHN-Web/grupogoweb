package com.goweboficial.entregador;

import android.content.Context;
import android.content.SharedPreferences;

/** Estado pequeno do app guardado no aparelho (sobrevive ao fechamento do app). */
final class Prefs {
    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences("atlas", Context.MODE_PRIVATE);
    }

    static boolean tracking(Context c) { return sp(c).getBoolean("tracking", false); }
    static void setTracking(Context c, boolean v) { sp(c).edit().putBoolean("tracking", v).apply(); }

    static String str(Context c, String k, String def) { return sp(c).getString(k, def); }
    static void putStr(Context c, String k, String v) { sp(c).edit().putString(k, v).apply(); }

    static long lng(Context c, String k, long def) { return sp(c).getLong(k, def); }
    static void putLng(Context c, String k, long v) { sp(c).edit().putLong(k, v).apply(); }

    static float flt(Context c, String k, float def) { return sp(c).getFloat(k, def); }
    static void putFlt(Context c, String k, float v) { sp(c).edit().putFloat(k, v).apply(); }

    static boolean bool(Context c, String k, boolean def) { return sp(c).getBoolean(k, def); }
    static void putBool(Context c, String k, boolean v) { sp(c).edit().putBoolean(k, v).apply(); }

    static void remove(Context c, String... keys) {
        SharedPreferences.Editor e = sp(c).edit();
        for (String k : keys) e.remove(k);
        e.apply();
    }
}
