import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { Bell } from "lucide-react";
import ReminderDialog from "./ReminderDialog";

interface ChatMessage {
  id: string;
  user: string;
  message: string;
  timestamp: number;
}

interface LeadDetailsDialogProps {
  lead: SheetLead;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

// Helper to get chat messages from localStorage by lead id
const getChatMessagesForLead = (leadId: string): ChatMessage[] => {
  if (!leadId) return [];
  const stored = localStorage.getItem(`chat_${leadId}`);
  return stored ? JSON.parse(stored) : [];
};

// Helper to save chat messages in localStorage
const saveChatMessagesForLead = (leadId: string, messages: ChatMessage[]) => {
  if (!leadId) return;
  localStorage.setItem(`chat_${leadId}`, JSON.stringify(messages));
};

const LeadDetailsDialog = ({ lead, open, onClose, onUpdate }: LeadDetailsDialogProps) => {
  const [formData, setFormData] = useState<SheetLead>({
    ...lead,
    travelDate: convertToDisplayDate(lead.travelDate),
  });
  const [saving, setSaving] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [dateError, setDateError] = useState<string>("");
  const { toast } = useToast();

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat messages when lead changes or dialog opens
  useEffect(() => {
    setChatMessages(getChatMessagesForLead(lead.tripId || lead.travellerName || ""));
  }, [lead]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Add new message to chat
  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      user: "You",
      message: newMessage.trim(),
      timestamp: Date.now(),
    };
    const updated = [...chatMessages, msg];
    setChatMessages(updated);
    saveChatMessagesForLead(lead.tripId || lead.travellerName || "", updated);
    setNewMessage("");
  };

  // Existing date handlers, save logic, etc (unchanged) ...

  // ... Your existing code for handleDateChange, handleSave, render JSX for form fields

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead Details - {lead.travellerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ... Your existing inputs and selects */}

          {/* Chat Section */}
          <div className="border rounded-lg p-4 max-h-64 overflow-y-auto bg-muted/20">
            <Label>Chat Log</Label>
            <div className="space-y-2">
              {chatMessages.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No chat messages yet.</p>
              )}
              {chatMessages.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <span className="font-semibold">{msg.user}:</span>{" "}
                  <span>{msg.message}</span>
                  <span className="text-xs text-muted-foreground float-right">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef}></div>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Type a message"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <Button onClick={handleSendMessage}>Send</Button>
            </div>
          </div>

          {/* Your existing Notes, Remark History, Reminder Button, Save/Cancel buttons */}

        </div>
      </DialogContent>

      {showReminderDialog && (
        <ReminderDialog
          open={showReminderDialog}
          onClose={() => setShowReminderDialog(false)}
          leadTripId={lead.tripId}
          leadName={lead.travellerName}
          onReminderSet={(reminder) => {
            console.log("Reminder set:", reminder);
          }}
        />
      )}
    </Dialog>
  );
};

export default LeadDetailsDialog;
