import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { notificationSettingsService } from "@/lib/notificationSettings";

interface SnoozeOptionsDialogProps {
  leadId: string;
  leadName: string;
  children?: React.ReactNode; // Optional trigger element
  onSnoozeComplete?: () => void;
}

const SnoozeOptionsDialog: React.FC<SnoozeOptionsDialogProps> = ({
  leadId,
  leadName,
  children,
  onSnoozeComplete,
}) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const snoozeOptions = [
    { label: "1 Hour", duration: 60 * 60 * 1000 },
    { label: "4 Hours", duration: 4 * 60 * 60 * 1000 },
    { label: "24 Hours", duration: 24 * 60 * 60 * 1000 },
    { label: "Until Tomorrow (9 AM)", duration: calculateUntilTomorrow() },
    { label: "Never", duration: 0 }, // Represents unsnooze
  ];

  function calculateUntilTomorrow(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
    return tomorrow.getTime() - now.getTime();
  }

  const handleSnooze = async (duration: number) => {
    try {
      if (duration === 0) {
        await notificationSettingsService.unsnoozeLead(leadId);
        toast({
          title: "Snooze Removed",
          description: `Notifications for ${leadName} are now active.`,
        });
      } else {
        await notificationSettingsService.snoozeLead(leadId, duration);
        const snoozeUntil = new Date(Date.now() + duration);
        toast({
          title: "Lead Snoozed",
          description: `Notifications for ${leadName} snoozed until ${snoozeUntil.toLocaleString()}.`,
        });
      }
      onSnoozeComplete?.();
      setOpen(false);
    } catch (error) {
      console.error("Failed to snooze lead:", error);
      toast({
        variant: "destructive",
        title: "Snooze Failed",
        description: "Could not update snooze settings.",
      });
    }
  };

  // Check if lead is currently snoozed to adjust "Never" option.
  const [isCurrentlySnoozed, setIsCurrentlySnoozed] = useState(false);
  useEffect(() => {
    const checkSnoozeStatus = async () => {
      setIsCurrentlySnoozed(await notificationSettingsService.isLeadSnoozed(leadId));
    };
    if (open) checkSnoozeStatus();
  }, [open, leadId]);


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="gap-1">
            <Clock className="h-4 w-4" /> Snooze
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle>Snooze Notifications</DialogTitle>
          <DialogDescription>
            Temporarily silence notifications for **{leadName}**.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          {snoozeOptions.map((option) => (
            <Button
              key={option.label}
              variant="outline"
              onClick={() => handleSnooze(option.duration)}
              className="justify-start"
            >
              {option.label}
              {option.duration === 0 && isCurrentlySnoozed && " (Active)"}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SnoozeOptionsDialog;
