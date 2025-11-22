package com.myapp.calltracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      if (intent.action == "android.intent.action.BOOT_COMPLETED") {
        val svc = Intent(context, CallStateService::class.java)
        context.startService(svc)
      }
    } catch (e: Exception) {
      Log.e("BootReceiver", "Failed to start CallStateService", e)
    }
  }
}