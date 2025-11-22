package com.myapp.calltracker

import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import android.content.Intent
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import android.content.Context
import org.json.JSONObject

/**
 * Listens for call state changes and emits normalized events to LocalBroadcastManager.
 * No historical call logs are read; purely state transitions.
 */
class SimplePhoneStateListener(
    private val appContext: Context
) : PhoneStateListener() {

    private var lastState: Int = TelephonyManager.CALL_STATE_IDLE
    private var isIncoming: Boolean = false
    private var callStartTime: Long = 0L
    private var savedNumber: String? = null

    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
        // phoneNumber can be null on some devices/versions
        val number = phoneNumber?.ifBlank { null } ?: savedNumber

        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                isIncoming = true
                callStartTime = System.currentTimeMillis()
                savedNumber = phoneNumber
                broadcastEvent("callRing", number, null, null, 0, true)
            }

            TelephonyManager.CALL_STATE_OFFHOOK -> {
                // Transition from RINGING -> OFFHOOK => incoming answered
                // Transition from IDLE -> OFFHOOK => outgoing started
                callStartTime = System.currentTimeMillis()
                val event = if (lastState == TelephonyManager.CALL_STATE_RINGING) {
                    isIncoming = true
                    "callAnswered"
                } else {
                    isIncoming = false
                    "callStarted"
                }
                savedNumber = phoneNumber ?: savedNumber
                broadcastEvent(event, number, callStartTime, null, 0, isIncoming)
            }

            TelephonyManager.CALL_STATE_IDLE -> {
                // Call ended or missed
                val endTime = System.currentTimeMillis()
                val durationSecs = if (callStartTime > 0) ((endTime - callStartTime) / 1000).toInt() else 0
                when (lastState) {
                    TelephonyManager.CALL_STATE_RINGING -> {
                        // Was ringing then went idle => missed
                        broadcastEvent("missedCall", number, callStartTime, endTime, 0, true)
                    }
                    TelephonyManager.CALL_STATE_OFFHOOK -> {
                        val event = if (isIncoming) "incomingEnded" else "outgoingEnded"
                        broadcastEvent(event, number, callStartTime, endTime, durationSecs, isIncoming)
                    }
                    else -> {
                        // idle -> idle, ignore
                    }
                }
                callStartTime = 0L
                savedNumber = null
            }
        }
        lastState = state
    }

    private fun broadcastEvent(
        event: String,
        number: String?,
        start: Long?,
        end: Long?,
        durationSecs: Int,
        incoming: Boolean
    ) {
        val payload = JSONObject().apply {
          put("event", event)
          put("number", number ?: JSONObject.NULL)
          if (start != null) put("startTimestamp", start) else put("startTimestamp", JSONObject.NULL)
          if (end != null) put("endTimestamp", end) else put("endTimestamp", JSONObject.NULL)
          put("durationSeconds", durationSecs)
          put("incoming", incoming)
        }
        val intent = Intent("com.myapp.calltracker.CALL_EVENT")
        intent.putExtra("payload", payload.toString())
        LocalBroadcastManager.getInstance(appContext).sendBroadcast(intent)
    }
}
