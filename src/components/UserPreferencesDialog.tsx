import React, { useEffect, useState, ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings2 } from "lucide-react";
import { notificationSettingsService, type NotificationSettings } from "@/lib/notificationSettings";
import { Capacitor } from "@capacitor/core";
import { Preferences } from '@capacitor/preferences';
import { initPush, unregisterPush } from "@/lib/nativePush";
import { useToast } from "@/hooks/use-toast";

// Helper component for settings rows - duplicated from Settings.tsx for now, can be abstracted later
const SettingsRow = ({ id, label, description, ...props }: { id: string, label: string, description: string } & ComponentProps<typeof Switch>) => (
  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
    <div className="flex flex-col">
      <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <Switch id={id} {...props} />
  </div>
);

interface UserPreferencesDialogProps {
  children?: React.ReactNode;
}

const UserPreferencesDialog: React.FC<UserPreferencesDialogProps> = ({ children }) => {
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false); // ✅ NEW state for push enabled
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      (async () => {
        try {
          const settings = await notificationSettingsService.getSettings();
          setNotifSettings(settings);
        } catch (error) {
          console.error("Failed to load notification settings:", error);
        }

        // ✅ Load push preferences
        try {
          const res = await Preferences.get({ key: 'push_enabled' });
          setPushEnabled(res.value === 'true');
        } catch (error) {
          console.error("Failed to load push preferences:", error);
        }
      })();
    }
  }, [open]);

  const handleNotifSettingChange = async (key: keyof NotificationSettings, value: boolean) => {
    if (!notifSettings) return;
    const newSettings = { ...notifSettings, [key]: value };
    setNotifSettings(newSettings);
    await notificationSettingsService.saveSettings(newSettings);
  };

  // ✅ Handler for Push Notification Toggle
  const handleTogglePush = async (next: boolean) => {
    try {
      await Preferences.set({ key: 'push_enabled', value: String(next) });
      setPushEnabled(next);
      if (next) {
        await initPush();
        toast({ title: 'Push enabled', description: 'Registered for push notifications' });
      } else {
        await unregisterPush();
        toast({ title: 'Push disabled', description: 'You will not receive native push' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to update push', description: e?.message || 'Unknown error' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button variant="ghost" size="icon" aria-label="User Preferences"><Settings2 className="h-5 w-5" /></Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Preferences</DialogTitle>
          <DialogDescription>
            Manage your personal settings and notification preferences.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* ✅ Push Notifications Card */}
          <Card className="shadow-none border-none">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-lg">Native Push Notifications</CardTitle>
              <CardDescription>Enable/disable native push notifications (Android)</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex flex-col">
                  <Label htmlFor="push-toggle" className="text-sm font-medium cursor-pointer">Enable native push</Label>
                  <p className="text-xs text-muted-foreground">Receive notifications even when app is closed.</p>
                </div>
                <Switch 
                  id="push-toggle"
                  checked={pushEnabled}
                  onCheckedChange={handleTogglePush}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-none"> {/* No extra shadow/border for dialog content */}
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-lg">Detailed Notifications</CardTitle>
              <CardDescription>Choose which real-time and local notifications to receive.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border px-0">
              {!notifSettings ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <SettingsRow
                    id="notif-new-trip"
                    label="New Trip Added"
                    description="Notify when a new trip is created."
                    checked={notifSettings.new_trip}
                    onCheckedChange={(value) => handleNotifSettingChange('new_trip', value)}
                  />
                  <SettingsRow
                    id="notif-trip-assigned"
                    label="Trip Assigned to Me"
                    description="Notify when a trip is assigned to you."
                    checked={notifSettings.trip_assigned}
                    onCheckedChange={(value) => handleNotifSettingChange('trip_assigned', value)}
                  />
                  <SettingsRow
                    id="notif-trip-booked"
                    label="Trip Booked"
                    description="Notify when anyone books a trip."
                    checked={notifSettings.trip_booked}
                    onCheckedChange={(value) => handleNotifSettingChange('trip_booked', value)}
                  />
                  <SettingsRow
                    id="notif-blackboard"
                    label="Blackboard Posts"
                    description="Notify on new announcements or posts."
                    checked={notifSettings.blackboard_post}
                    onCheckedChange={(value) => handleNotifSettingChange('blackboard_post', value)}
                  />
                  <SettingsRow
                    id="notif-followup"
                    label="Follow-Up Reminders"
                    description="Notify for scheduled follow-ups."
                    checked={notifSettings.follow_up}
                    onCheckedChange={(value) => handleNotifSettingChange('follow_up', value)}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserPreferencesDialog;


