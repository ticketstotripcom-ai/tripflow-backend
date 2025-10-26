import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";

interface Reminder {
  id: string;
  leadTripId: string;
  leadName: string;
  dateTime: number; // timestamp
  message: string;
  notified: boolean;  // to avoid repeated notifications
}

interface ReminderDialogProps {
  open: boolean;
  onClose: () => void;
  leadTripId: string;
  leadName: string;
  onReminderSet: (reminder: { date: string; time: string; message: string }) => void;
}

const STORAGE_KEY = "crm_reminders";

// Helper to get reminders from localStorage
const getReminders = (): Reminder[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

// Helper to save reminders to localStorage
const saveReminders = (reminders: Reminder[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
};

// Background worker to check reminders every minute and notify
const startReminderWorker = (toast: ReturnType<typeof useToast>) => {
  setInterval(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const reminders = getReminders();
    const now = Date.now();
    let updated = false;

    reminders.forEach((reminder) => {
      if (!reminder.notified && now >= reminder.dateTime) {
        // Show desktop notification
        new Notification("Lead Reminder", {
          body: `${reminder.leadName} - ${reminder.message || "Follow up required"}`,
          icon: "/favicon.ico",
        });

        // Play sound
        const audio = new Audio(
          "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDmH0fPTgjMGHm7A7+OZSA=="
        );
        audio.play().catch(() => {});

        // Show in-app toast
        toast.toast({
          title: "Reminder",
          description: `${reminder.leadName} - ${reminder.message || "Follow up required"}`,
        });

        reminder.notified = true;
        updated = true;
      }
    });

    if (updated) {
      saveReminders(reminders);
    }
  }, 60000); // Check every 60 seconds
};

const ReminderDialog = ({ open, onClose, leadTripId, leadName, onReminderSet }: ReminderDialogProps) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      // Request permission on dialog open
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, [open]);

  useEffect(() => {
    startReminderWorker(toast);
  }, [toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!date || !time) {
      toast.toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select both date and time for the reminder",
      });
      return;
    }

    const reminderDateTime = new Date(`${date}T${time}`);
    if (reminderDateTime < new Date()) {
      toast.toast({
        variant: "destructive",
        title: "Invalid Time",
        description: "Reminder time must be in the future",
      });
      return;
    }

    // Save reminder to localStorage
    const newReminder: Reminder = {
      id: Date.now().toString(),
      leadTripId,
      leadName,
      dateTime: reminderDateTime.getTime(),
      message,
      notified: false,
    };

    const reminders = getReminders();
    reminders.push(newReminder);
    saveReminders(reminders);

    onReminderSet({ date, time, message });

    toast.toast({
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
              min={new Date().toISOString().split("T")[0]}
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
            <Button type="submit" className="gap-2">
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
