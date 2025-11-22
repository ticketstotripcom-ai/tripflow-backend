import { useState, useCallback } from "react";
import { useSwipeable } from "react-swipeable";
import {
  Phone,
  Mail,
  MessageCircle,
  Calendar,
  MapPin,
  Users,
  Moon,
  CheckCircle,
  Bell,
  XCircle,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { formatDisplayDate, isPast } from "@/lib/dateUtils";
import WhatsAppTemplateDialog from "./WhatsAppTemplateDialog";
import { useParallax } from "@/hooks/useParallax";
import { useImagePreloader } from "@/hooks/useImagePreloader";

interface LeadCardProps {
  lead: SheetLead;
  onClick: () => void;
  onAssign?: () => void;
  showAssignButton?: boolean;
  onSwipeLeft?: (lead: SheetLead) => void;
  onSwipeRight?: (lead: SheetLead) => void;
  onPriorityUpdated?: (lead: SheetLead, newPriority: string) => void;
  swipeEnabled?: boolean;
}

const STATUS_PIPELINE_ORDER = [
  "Unfollowed",
  "Follow-up Calls",
  "Working on it",
  "Whatsapp Sent",
  "Proposal 1 Shared",
  "Proposal 2 Shared",
  "Proposal 3 Shared",
  "Negotiations",
  "Hot Leads",
  "Booked With Us",
];

const getStatusProgress = (status: string): number => {
  const index = STATUS_PIPELINE_ORDER.findIndex(
    (s) => s.toLowerCase() === status.toLowerCase()
  );
  return index >= 0 ? ((index + 1) / STATUS_PIPELINE_ORDER.length) * 100 : 0;
};

const getStatusColor = (status: string): string => {
  const lower = status.toLowerCase();
  if (lower.includes("booked")) return "bg-green-500";
  if (lower.includes("hot") || lower.includes("negotiations"))
    return "bg-orange-500";
  if (lower.includes("proposal")) return "bg-blue-500";
  if (lower.includes("working") || lower.includes("whatsapp"))
    return "bg-purple-500";
  return "bg-gray-500";
};

const getCardBackgroundByStatus = (status: string, priority: string) => {
  const lowerStatus = status.toLowerCase();
  const lowerPriority = priority?.toLowerCase() || "medium";
  if (lowerStatus.includes("booked with us"))
    return "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800";
  if (lowerStatus.includes("hot") || lowerStatus.includes("negotiations"))
    return "bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-orange-200 dark:border-orange-800";
  if (lowerStatus.includes("proposal"))
    return "bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-blue-200 dark:border-blue-800";
  if (lowerStatus.includes("working") || lowerStatus.includes("whatsapp"))
    return "bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200 dark:border-purple-800";
  if (lowerPriority === "high")
    return "bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border-red-200 dark:border-red-800";
  if (lowerPriority === "low")
    return "bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30 border-slate-200 dark:border-slate-800";
  return "bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black border-slate-700";
};

const STATE_IMAGES: Record<string, string> = {
  "HIMACHAL PRADESH": "https://ticketstotrip.com/cdn-assets/original/chamba-himachal.jpg",
  "UTTARAKHAND": "https://ticketstotrip.com/cdn-assets/original/uttarakhand-1-.jpg",
  "RAJASTHAN": "https://ticketstotrip.com/cdn-assets/original/1-pushkar-ajmer-4-.jpg",
  "KERALA": "https://ticketstotrip.com/cdn-assets/original/i-am-in-kerala-and-waiting-for-my-houseboat-and-my-girlfrind-waiting-for-me.jpg",
  "GOA": "https://ticketstotrip.com/cdn-assets/original/palolem-beach-south-goa-1920x1080.jpg",
  "KASHMIR": "https://ticketstotrip.com/cdn-assets/original/winter-kashmir.jpg",
  "LADAKH": "https://ticketstotrip.com/cdn-assets/original/28.jpg",
  "ANDAMAN": "https://ticketstotrip.com/cdn-assets/original/a-couple-of-men-and-woman-at-a-swing-on-the-beach-2025-01-08-22-39-59-utc-1-.jpg",
  "NORTH EAST": "https://ticketstotrip.com/cdn-assets/original/10-pelling-and-yuksom-sikkim-4-.jpg",
  "SIKKIM": "https://ticketstotrip.com/cdn-assets/original/sikkim.png",
  "TAMIL NADU": "https://ticketstotrip.com/cdn-assets/original/tamil-nadu-profile.jpg",
  "KARNATAKA": "https://ticketstotrip.com/cdn-assets/original/gokarnatourism-header-gokarna-tourism-jpg.jpg",
  "GUJARAT": "https://ticketstotrip.com/cdn-assets/original/complete-guide-to-the-gir-national-park-gujarat2.jpg",
  "MAHARASHTRA": "https://ticketstotrip.com/cdn-assets/original/best-tourist-destinations-to-visit-in-maharashtra-india-1.jpg",
  "PUNJAB": "https://ticketstotrip.com/cdn-assets/original/punjab.webp",
  "ODISHA": "https://ticketstotrip.com/cdn-assets/original/0373f2b3ab7293686bf72d1eed6f60d5.webp",
};

export const LeadCard = ({
  lead,
  onClick,
  onAssign,
  showAssignButton = false,
  onSwipeLeft,
  onSwipeRight,
  onPriorityUpdated,
  swipeEnabled = true,
}: LeadCardProps) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [localPriority, setLocalPriority] = useState(
    lead.priority?.toLowerCase() || "medium"
  );
  const { toast } = useToast();
  const priority = localPriority;
  const cardBg = getCardBackgroundByStatus(lead.status, priority);
  const progress = getStatusProgress(lead.status);
  const parallax = useParallax(0.03);
  const textShadowStyle = { textShadow: "0 1px 2px rgba(0,0,0,0.7)" } as const;

  // Preload background image safely
  const stateImageKey = String(lead.travelState || "").trim().toUpperCase();
  const backgroundImageUrl = STATE_IMAGES[stateImageKey];
  const { loaded: imageLoaded, error: imageError } = useImagePreloader(backgroundImageUrl);

  // 🔹 Log user interactions in Sheets
  const logInteraction = useCallback(
    async (verb: "called" | "emailed" | "whatsapped") => {
      try {
        const { authService } = await import("@/lib/authService");
        const session = authService.getSession();
        const userName = session?.user?.name || "User";
        const customer = lead.travellerName || "";
        const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
        const line = `[${stamp}] ${userName} ${verb} ${customer} via app`;
        const credentials = await secureStorage.getCredentials();
        if (!credentials) return;
        const sheetsService = new GoogleSheetsService({
          apiKey: credentials.googleApiKey,
          serviceAccountJson: credentials.googleServiceAccountJson,
          sheetId:
            credentials.googleSheetUrl.match(
              /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
            )?.[1] || "",
          worksheetNames: credentials.worksheetNames,
          columnMappings: credentials.columnMappings,
        });
        const existing = (lead.remarks || "").toString().trim();
        const updated = existing ? `${existing}\n${line}` : line;
        const existingNotes = (lead.notes || "").toString().trim();
        const notesUpdated = existingNotes ? `${existingNotes} | ${line}` : line;
        await sheetsService.updateLead(
          { dateAndTime: lead.dateAndTime, travellerName: lead.travellerName },
          { remarks: updated, notes: notesUpdated }
        );
      } catch (e) {
        console.warn("Failed to log interaction", e);
      }
    },
    [lead]
  );

  const handlers = swipeEnabled ? useSwipeable({
    onSwiping: (e) => setSwipeOffset(e.deltaX),
    onSwipedLeft: () => {
      if (onSwipeLeft) {
        setIsCancelled(true);
        onSwipeLeft(lead);
        setTimeout(() => setIsCancelled(false), 2000);
      }
      setSwipeOffset(0);
    },
    onSwipedRight: () => {
      if (onSwipeRight) {
        setReminderSet(true);
        onSwipeRight(lead);
        setTimeout(() => setReminderSet(false), 2000);
      }
      setSwipeOffset(0);
    },
    onSwiped: () => setSwipeOffset(0),
    trackMouse: true,
    delta: 50,
  }) : ({} as any);

  const handlePriorityChange = async (value: string) => {
    setLocalPriority(value);
    try {
      const credentials = await secureStorage.getCredentials();
      if (!credentials)
        throw new Error("Google Sheets credentials not configured.");
      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId:
          credentials.googleSheetUrl.match(
            /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
          )?.[1] || "",
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings,
      });
      onPriorityUpdated?.(lead, value);
      await sheetsService.updateLead(lead, { priority: value });
      toast({
        title: "Priority updated",
        description: `${lead.travellerName} → ${value}`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to update priority",
        description: e.message || "Unknown error",
      });
      setLocalPriority(lead.priority?.toLowerCase() || "medium");
    }
  };

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      void logInteraction("called");
    } catch {}
    if (lead.phone) window.location.href = `tel:${lead.phone}`;
  };

  const handleEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      void logInteraction("emailed");
    } catch {}
    if (lead.email) window.location.href = `mailto:${lead.email}`;
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      void logInteraction("whatsapped");
    } catch {}
    setShowWhatsAppDialog(true);
  };

  const handleAssign = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAssign?.();
  };

  return (
    <>
      <div
        {...handlers}
        className="relative"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? "transform 0.3s ease-out" : "none",
        }}
      >
        {swipeOffset < -50 && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-center px-4 bg-red-500 text-white rounded-r-lg z-0">
            <XCircle className="h-6 w-6" />
          </div>
        )}
        {swipeOffset > 50 && (
          <div className="absolute inset-y-0 left-0 flex items-center justify-center px-4 bg-blue-500 text-white rounded-l-lg z-0">
            <Bell className="h-6 w-6" />
          </div>
        )}

        {isCancelled && (
          <div className="absolute top-2 right-2 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-fade-in">
            ✗ Cancelled
          </div>
        )}
        {reminderSet && (
          <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-fade-in">
            🔔 Reminder Set!
          </div>
        )}

        <Card
          className={`p-3 sm:p-4 cursor-pointer hover:shadow-glow hover:scale-[1.02] transition-all duration-300 ${cardBg} animate-fade-in border-2 relative overflow-hidden z-10`}
          onClick={onClick}
        >
          {/* Placeholder before image loads */}
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 animate-pulse" />
          )}

          {/* Parallax background layer */}
        {backgroundImageUrl && !imageError && (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 will-change-transform"
            style={{
              backgroundImage: `url(${backgroundImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              transform: parallax.transform,
              filter: 'saturate(1.05) brightness(1.02)'
            }}
          />
        )}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
          <div className="space-y-3 text-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base sm:text-lg truncate text-white" style={textShadowStyle}>
                  {lead.travellerName}
                </h3>
                <p className="text-xs sm:text-sm text-white/90 truncate" style={textShadowStyle}>
                  {lead.tripId}
                </p>
              </div>
              <Badge
                className={`${getStatusColor(lead.status)} text-white text-xs shrink-0`}
              >
                {lead.status}
              </Badge>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-white/90">
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate" style={textShadowStyle}>{lead.travelState}</span>
              </div>

              {lead.travelDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                  <span className="font-medium truncate" style={textShadowStyle}>
                    {formatDisplayDate(lead.travelDate)}
                  </span>
                  {lead.status.toLowerCase().includes("booked with us") &&
                    (isPast(lead.travelDate) ? (
                      <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                    ) : (
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />
                    ))}
                </div>
              )}

              <div className="flex items-center gap-4">
                {lead.nights && (
                  <div className="flex items-center gap-1">
                    <Moon className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>{lead.nights}N</span>
                  </div>
                )}
                {lead.pax && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>{lead.pax}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Pipeline Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${getStatusColor(
                    lead.status
                  )} transition-all duration-500`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              {lead.consultant ? (
                <div className="text-white/90" style={textShadowStyle}>
                  Assigned to: <span className="font-medium text-white" style={textShadowStyle}>{lead.consultant}</span>
                </div>
              ) : (
                <div className="text-orange-300 dark:text-orange-300 font-medium" style={textShadowStyle}>
                  Unassigned
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-white/80">
                  Priority
                </div>
                <Select value={priority} onValueChange={handlePriorityChange}>
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">🔴 High</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="low">🟢 Low</SelectItem>
                  </SelectContent>
                </Select>
                {showAssignButton && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 text-xs"
                    onClick={handleAssign}
                  >
                    {lead.consultant ? "Reassign" : "Unassigned"}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant="default"
                className="flex-1 gap-1 text-xs sm:text-sm"
                onClick={handleCall}
              >
                <Phone className="h-3 w-3 sm:h-4 sm:w-4" /> Call
              </Button>
              <Button
                size="sm"
                variant="default"
                className="flex-1 gap-1 text-xs sm:text-sm"
                onClick={handleEmail}
              >
                <Mail className="h-3 w-3 sm:h-4 sm:w-4" /> Email
              </Button>
              <Button
                size="sm"
                variant="default"
                className="flex-1 gap-1 text-xs sm:text-sm"
                onClick={handleWhatsApp}
              >
                <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4" /> WhatsApp
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {showWhatsAppDialog && (
        <WhatsAppTemplateDialog
          open={showWhatsAppDialog}
          onClose={() => setShowWhatsAppDialog(false)}
          lead={lead}
        />
      )}
    </>
  );
};

export default LeadCard;
