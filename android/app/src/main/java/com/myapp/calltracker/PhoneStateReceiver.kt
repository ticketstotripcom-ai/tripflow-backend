package com.myapp.calltracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class PhoneStateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      val svc = Intent(context, CallStateService::class.java)
      context.startService(svc)
    } catch (e: Exception) {
      Log.e("PhoneStateReceiver", "Failed to start CallStateService", e)
    }
  }
}