import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, MessageCircle, Calendar, MapPin, Users, Moon, CheckCircle, Bell, XCircle, Clock } from "lucide-react";
// SheetLead imported below with GoogleSheetsService
import { useState } from "react";
import { useSwipeable } from "react-swipeable";
import WhatsAppTemplateDialog from "./WhatsAppTemplateDialog";
import { formatDisplayDate, isPast, parseFlexibleDate } from "@/lib/dateUtils";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { useToast } from "@/hooks/use-toast";

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

// Date formatting is unified via dateUtils

const getCardBackgroundByStatus = (status: string, priority: string) => {
  const lowerStatus = status.toLowerCase();
  const lowerPriority = priority?.toLowerCase() || 'medium';
  if (lowerStatus.includes('booked with us')) {
    return 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800';
  }
  if (lowerStatus.includes('hot') || lowerStatus.includes('negotiations')) {
    return 'bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-orange-200 dark:border-orange-800';
  }
  if (lowerStatus.includes('proposal')) {
    return 'bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border-blue-200 dark:border-blue-800';
  }
  if (lowerStatus.includes('working') || lowerStatus.includes('whatsapp')) {
    return 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200 dark:border-purple-800';
  }
  if (lowerPriority === 'high') {
    return 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border-red-200 dark:border-red-800';
  }
  if (lowerPriority === 'low') {
    return 'bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30 border-slate-200 dark:border-slate-800';
  }
  return 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border-yellow-200 dark:border-yellow-800';
};

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
  const index = STATUS_PIPELINE_ORDER.findIndex(s => s.toLowerCase() === status.toLowerCase());
  return index >= 0 ? ((index + 1) / STATUS_PIPELINE_ORDER.length) * 100 : 0;
};

const getStatusColor = (status: string): string => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('booked')) return 'bg-green-500';
  if (lowerStatus.includes('hot') || lowerStatus.includes('negotiations')) return 'bg-orange-500';
  if (lowerStatus.includes('proposal')) return 'bg-blue-500';
  if (lowerStatus.includes('working') || lowerStatus.includes('whatsapp')) return 'bg-purple-500';
  return 'bg-gray-500';
};

export const LeadCard = ({ lead, onClick, onAssign, showAssignButton = false, onSwipeLeft, onSwipeRight, onPriorityUpdated, swipeEnabled = true }: LeadCardProps) => {
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [localPriority, setLocalPriority] = useState<string>(lead.priority?.toLowerCase() || 'medium');
  const priority = localPriority;
  const progress = getStatusProgress(lead.status);
  const cardBg = getCardBackgroundByStatus(lead.status, priority);
  const { toast } = useToast();

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!swipeEnabled) return;
      setSwipeOffset(eventData.deltaX);
    },
    onSwipedLeft: () => {
      if (!swipeEnabled) return;
      if (onSwipeLeft) {
        setIsCancelled(true);
        onSwipeLeft(lead);
        setTimeout(() => setIsCancelled(false), 2000);
      }
      setSwipeOffset(0);
    },
    onSwipedRight: () => {
      if (!swipeEnabled) return;
      if (onSwipeRight) {
        setReminderSet(true);
        onSwipeRight(lead);
        setTimeout(() => setReminderSet(false), 2000);
      }
      setSwipeOffset(0);
    },
    onSwiped: () => {
      if (!swipeEnabled) return;
      setSwipeOffset(0);
    },
    trackMouse: swipeEnabled,
    delta: swipeEnabled ? 50 : 100000,
  });

  const effectiveSwipeOffset = swipeEnabled ? swipeOffset : 0;

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${lead.phone}`;
  };

  const handleEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `mailto:${lead.email}`;
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowWhatsAppDialog(true);
  };

  const handleAssign = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAssign) onAssign();
  };

  const handlePriorityChange = async (value: string) => {
    setLocalPriority(value);
    try {
      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error('Google Sheets credentials not configured.');
      let effectiveServiceAccountJson = credentials.googleServiceAccountJson;
      if (!effectiveServiceAccountJson) {
        try { effectiveServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
      }
      if (!effectiveServiceAccountJson) throw new Error('Service Account JSON missing');
      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: effectiveServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings,
      });
      // Optimistic notify parent
      onPriorityUpdated?.(lead, value);
      console.log('✅ Using Service Account for Sheets write operation');
      await sheetsService.updateLead(lead, { priority: value });
      toast({ title: 'Priority updated', description: `${lead.travellerName} → ${value}`, duration: 2500 });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to update priority', description: e.message || 'Unknown error', duration: 4000 });
      // revert UI if failed
      setLocalPriority(lead.priority?.toLowerCase() || 'medium');
    }
  };

  return (
    <>
      <div 
        {...handlers}
        className={`relative ${!swipeEnabled ? 'touch-pan-y' : ''}`}
        style={{
          transform: `translateX(${effectiveSwipeOffset}px)`,
          transition: effectiveSwipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {swipeEnabled && effectiveSwipeOffset < -50 && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-center px-4 bg-red-500 text-white rounded-r-lg z-0">
            <XCircle className="h-6 w-6" />
          </div>
        )}
        {swipeEnabled && effectiveSwipeOffset > 50 && (
          <div className="absolute inset-y-0 left-0 flex items-center justify-center px-4 bg-blue-500 text-white rounded-l-lg z-0">
            <Bell className="h-6 w-6" />
          </div>
        )}

        {isCancelled && (
          <div className="absolute top-2 right-2 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-fade-in">
            ✗ Cancellations
          </div>
        )}
        {reminderSet && (
          <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-fade-in">
            🔔 Reminder Set!
          </div>
        )}

      <Card 
        className={`p-3 sm:p-4 cursor-pointer hover:shadow-glow hover:scale-[1.02] transition-all duration-300 ${cardBg} animate-fade-in border-2 relative z-10`}
        onClick={onClick}
      >
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base sm:text-lg truncate">{lead.travellerName}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{lead.tripId}</p>
          </div>
          <Badge className={`${getStatusColor(lead.status)} text-white text-xs shrink-0`}>
            {lead.status}
          </Badge>
        </div>

        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">{lead.travelState}</span>
          </div>
          
          {lead.travelDate && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="font-medium truncate text-xs sm:text-sm">{formatDisplayDate(lead.travelDate)}</span>
              {lead.status.toLowerCase().includes('booked with us') && (
                isPast(lead.travelDate) ? (
                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                ) : (
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />
                )
              )}
            </div>
          )}
          
          <div className="flex items-center gap-3 sm:gap-4 text-muted-foreground">
            {lead.nights && (
              <div className="flex items-center gap-1">
                <Moon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                <span className="text-xs sm:text-sm">{lead.nights}N</span>
              </div>
            )}
            {lead.pax && (
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                <span className="text-xs sm:text-sm">{lead.pax}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Pipeline Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full ${getStatusColor(lead.status)} transition-all duration-500`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          {lead.consultant ? (
            <div className="text-muted-foreground">
              Assigned to: <span className="font-medium">{lead.consultant}</span>
            </div>
          ) : (
            <div className="text-orange-600 dark:text-orange-400 font-medium">
              Unassigned
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-muted-foreground">Priority</div>
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
                variant="secondary"
                className="h-6 text-xs"
                onClick={handleAssign}
              >
                {lead.consultant ? 'Reassign' : 'Assign'}
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-1 sm:gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0"
            onClick={handleCall}
          >
            <Phone className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">Call</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0"
            onClick={handleEmail}
          >
            <Mail className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">Email</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden xs:inline">WhatsApp</span>
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
