package com.goweboficial.crm;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** Widget da tela inicial (ver Widgets.java). Atualiza a cada 15 min, ao abrir o app e no botão ↻. */
public class VisitsWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        Widgets.updateAll(context, false);
        SyncWorker.schedule(context);
        SyncWorker.now(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && Widgets.REFRESH.equals(intent.getAction())) {
            Widgets.updateAll(context, true);
            SyncWorker.now(context);
        }
    }
}
