import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageCircle, Calendar, MapPin, Users, Moon, CheckCircle, Bell } from "lucide-react";
import { SheetLead } from "@/lib/googleSheets";
import { useState } from "react";
import { useSwipeable } from "react-swipeable";
import WhatsAppTemplateDialog from "./WhatsAppTemplateDialog";

interface LeadCardProps {
  lead: SheetLead;
  onClick: () => void;
  onAssign?: () => void;
  showAssignButton?: boolean;
  onSwipeLeft?: (lead: SheetLead) => void;
  onSwipeRight?: (lead: SheetLead) => void;
}

// Build lead score based on priority and status
const calculateLeadScore = (status: string, priority: string): number => {
  let score = 0;
  const lowerStatus = status.toLowerCase();
  const lowerPriority = priority?.toLowerCase() || "medium";

  // Score by status
  if (lowerStatus.includes("booked")) score += 100;
  else if (lowerStatus.includes("hot")) score += 80;
  else if (lowerStatus.includes("negotiations")) score += 70;
  else if (lowerStatus.includes("proposal")) score += 60;
  else if (lowerStatus.includes("working")) score += 40;
  else if (lowerStatus.includes("follow-up")) score += 20;
  else score += 10;

  // Bonus for priority
  if (lowerPriority === "high") score += 20;
  else if (lowerPriority === "low") score -= 10;

  return score;
};

const getScoreBadgeColor = (score: number): string => {
  if (score >= 100) return "bg-green-600";
  if (score >= 80) return "bg-orange-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-purple-500";
  if (score >= 20) return "bg-yellow-500";
  return "bg-gray-400";
};

export const LeadCard = ({ lead, onClick, onAssign, showAssignButton = false, onSwipeLeft, onSwipeRight }: LeadCardProps) => {
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isConverted, setIsConverted] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const priority = lead.priority?.toLowerCase() || "medium";
  const progress = getStatusProgress(lead.status);
  const cardBg = getCardBackgroundByStatus(lead.status, priority);

  const leadScore = calculateLeadScore(lead.status, priority);

  const handlers = useSwipeable({
    onSwiping: (eventData) => setSwipeOffset(eventData.deltaX),
    onSwipedLeft: () => {
      onSwipeLeft && onSwipeLeft(lead);
      setIsConverted(true);
      setTimeout(() => setIsConverted(false), 2000);
      setSwipeOffset(0);
    },
    onSwipedRight: () => {
      onSwipeRight && onSwipeRight(lead);
      setReminderSet(true);
      setTimeout(() => setReminderSet(false), 2000);
      setSwipeOffset(0);
    },
    onSwiped: () => setSwipeOffset(0),
    trackMouse: true,
    delta: 50,
  });

  // handlers for call, email, whatsapp, assign sightly trimmed for brevity

  return (
    <>
      <div {...handlers} className="relative" style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? "transform 0.3s ease-out" : "none" }}>
        {/* Swipe feedback */}
        {/* Converted/Reminder badges */}
        {/* Lead Card */}
        <Card className={`p-3 sm:p-4 cursor-pointer hover:shadow-glow hover:scale-[1.02] transition-all duration-300 ${cardBg} animate-fade-in border-2 relative z-10`} onClick={onClick}>
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-base sm:text-lg truncate">{lead.travellerName}</h3>
              <Badge className={`${getScoreBadgeColor(leadScore)} text-white text-xs`} title={`Lead Score: ${leadScore}`}>
                Score: {leadScore}
              </Badge>
            </div>

            {/* ... rest of your content (status badge, travelState, travelDate etc) ... */}
