package com.myapp.calltracker

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.telephony.TelephonyManager
import android.content.Context
import android.util.Log

/**
 * Foreground-less service that registers a PhoneStateListener.
 * Does not read historical call logs; only listens to live state changes.
 */
class CallStateService : Service() {

    private var telephonyManager: TelephonyManager? = null
    private var listener: SimplePhoneStateListener? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            listener = SimplePhoneStateListener(applicationContext)
            @Suppress("DEPRECATION")
            telephonyManager?.listen(listener, android.telephony.PhoneStateListener.LISTEN_CALL_STATE)
        } catch (e: Exception) {
            Log.e("CallStateService", "Failed to start listener", e)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            @Suppress("DEPRECATION")
            telephonyManager?.listen(listener, android.telephony.PhoneStateListener.LISTEN_NONE)
        } catch (_: Exception) {}
    }
}
