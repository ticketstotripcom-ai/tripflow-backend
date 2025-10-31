import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { useGlobalPopupClose } from "@/hooks/useGlobalPopupClose";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!date || !time) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select both date and time for the reminder",
      });
      return;
    }

    const reminderDateTime = new Date(`${date}T${time}`);
    if (reminderDateTime < new Date()) {
      toast({
        variant: "destructive",
        title: "Invalid Time",
        description: "Reminder time must be in the future",
      });
      return;
    }

    onReminderSet({ date, time, message });
    
    // Schedule notification
    const now = new Date().getTime();
    const reminderTime = reminderDateTime.getTime();
    const delay = reminderTime - now;

    if (delay > 0 && delay < 2147483647) { // Max setTimeout delay
      setTimeout(() => {
        // Show notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Lead Reminder', {
            body: `${leadName} - ${message || 'Follow up required'}`,
            icon: '/favicon.ico',
          });
        }
        
        // Play sound
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDmH0fPTgjMGHm7A7+OZSA==');
        audio.play().catch(() => {});
        
        toast({
          title: "Reminder",
          description: `${leadName} - ${message || 'Follow up required'}`,
        });
      }, delay);
    }

    toast({
      title: "Reminder Set",
      description: `You'll be notified on ${new Date(reminderDateTime).toLocaleString()}`,
    });

    onClose();
  };

  // Request notification permission
  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
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
              onClick={requestNotificationPermission}
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
