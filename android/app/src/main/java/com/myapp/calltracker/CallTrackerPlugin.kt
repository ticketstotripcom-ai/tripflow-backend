package com.myapp.calltracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.JSObject

@CapacitorPlugin(
    name = "CallTracker",
    permissions = [
        Permission(strings = ["android.permission.READ_PHONE_STATE"], alias = "phoneState"),
        Permission(strings = ["android.permission.READ_PHONE_NUMBERS"], alias = "phoneNumbers")
    ]
)
class CallTrackerPlugin : Plugin() {

    private var receiver: BroadcastReceiver? = null

    override fun load() {
        super.load()
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val payloadStr = intent?.getStringExtra("payload") ?: return
                try {
                    val js = JSObject(payloadStr)
                    notifyListeners("callEvent", js)
                } catch (_: Exception) {}
            }
        }
        LocalBroadcastManager.getInstance(context)
            .registerReceiver(receiver, IntentFilter("com.myapp.calltracker.CALL_EVENT"))
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        receiver?.let {
          LocalBroadcastManager.getInstance(context).unregisterReceiver(it)
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        requestAllPermissions(call, "permCallback")
    }

    @PermissionCallback
    private fun permCallback(call: PluginCall) {
        call.resolve()
    }

    @PluginMethod
    fun startService(call: PluginCall) {
        val intent = Intent(context, CallStateService::class.java)
        context.startService(intent)
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        val intent = Intent(context, CallStateService::class.java)
        context.stopService(intent)
        call.resolve()
    }
}
