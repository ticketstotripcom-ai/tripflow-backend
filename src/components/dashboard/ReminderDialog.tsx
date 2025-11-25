import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { triggerNativeNotification } from '@/lib/nativeNotifications';
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { useGlobalPopupClose } from "@/hooks/useGlobalPopupClose";
import type { AppNotification } from "@/utils/notifications";

interface ReminderDialogProps {
  open: boolean;
  onClose: () => void;
  leadTripId: string;
  leadName: string;
  onReminderSet: (reminder: { date: string; time: string; message: string }) => void;
}

const ReminderDialog = ({ open, onClose, leadTripId, leadName, onReminderSet }: ReminderDialogProps) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  useGlobalPopupClose(() => {
    if (open) onClose();
  }, open);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!date || !time) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select both date and time for the reminder.",
      });
      return;
    }

    const reminderDateTime = new Date(`${date}T${time}`);
    if (reminderDateTime < new Date()) {
      toast({
        variant: "destructive",
        title: "Invalid Time",
        description: "Reminder time must be in the future.",
      });
      return;
    }

    onReminderSet({ date, time, message });
    
    // ✅ Schedule notification using the new centralized service
    const notificationPayload: AppNotification = {
      id: `reminder-${leadTripId}-${reminderDateTime.getTime()}`,
      title: `Lead Reminder: ${leadName}`,
      message: message || 'Follow up required.',
      type: 'follow_up', // Use the 'follow_up' type so it can be configured in settings
      createdAt: new Date().toISOString(),
      read: false,
      targetTripId: leadTripId,
      targetTravellerName: leadName,
      scheduleAt: reminderDateTime, // Set the future schedule date
    };

    await triggerNativeNotification(notificationPayload);

    toast({
      title: "Reminder Set",
      description: `You'll be notified on ${reminderDateTime.toLocaleString()}`,
    });

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Set Reminder - {leadName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Follow up on proposal..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              Set Reminder
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReminderDialog;
