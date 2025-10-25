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

/**
 * ✅ FIXED: Convert mm/dd/yyyy to "6 November 2025" format
 */
const formatTravelDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  try {
    // Remove any whitespace
    const s = String(dateStr).trim();
    console.log('📅 Formatting date:', s); // Debug log
    
    // Parse mm/dd/yyyy or m/d/yyyy format
    const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const mm = Number(match[1]);  // month
      const dd = Number(match[2]);  // day
      let yyyy = Number(match[3]);  // year
      
      // Convert 2-digit year to 4-digit
      if (yyyy < 100) {
        yyyy = yyyy < 50 ? 2000 + yyyy : 1900 + yyyy;
      }
      
      console.log('📅 Parsed:', { mm, dd, yyyy });
      
      // Create date object (month is 0-indexed in JavaScript)
      const date = new Date(yyyy, mm - 1, dd);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('⚠️ Invalid date:', s);
        return s;
      }
      
      // Format as "6 November 2025"
      const formatted = date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      
      console.log('✅ Formatted:', formatted);
      return formatted;
    }
    
    // If regex doesn't match, try Date constructor
    console.warn('⚠️ Date format not recognized, trying Date constructor:', s);
    const date = new Date(s);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    
    // Fallback: return original
    console.warn('❌ Could not format date:', s);
    return s;
  } catch (e) {
    console.error('❌ Error formatting date:', dateStr, e);
    return dateStr;
  }
};

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

export const LeadCard = ({ lead, onClick, onAssign, showAssignButton = false, onSwipeLeft, onSwipeRight }: LeadCardProps) => {
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isConverted, setIsConverted] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const priority = lead.priority?.toLowerCase() || 'medium';
  const progress = getStatusProgress(lead.status);
  const cardBg = getCardBackgroundByStatus(lead.status, priority);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      setSwipeOffset(eventData.deltaX);
    },
    onSwipedLeft: () => {
      if (onSwipeLeft) {
        setIsConverted(true);
        onSwipeLeft(lead);
        setTimeout(() => setIsConverted(false), 2000);
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
    onSwiped: () => {
      setSwipeOffset(0);
    },
    trackMouse: true,
    delta: 50,
  });

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

  return (
    <>
      <div 
        {...handlers}
        className="relative"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {swipeOffset < -50 && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-center px-4 bg-green-500 text-white rounded-r-lg z-0">
            <CheckCircle className="h-6 w-6" />
          </div>
        )}
        {swipeOffset > 50 && (
          <div className="absolute inset-y-0 left-0 flex items-center justify-center px-4 bg-blue-500 text-white rounded-l-lg z-0">
            <Bell className="h-6 w-6" />
          </div>
        )}
        
        {isConverted && (
          <div className="absolute top-2 right-2 z-10 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-fade-in">
            ✓ Converted!
          </div>
        )}
        {reminderSet && (
          <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-fade-in">
            🔔 Reminder Set!
          </div>
        )}

      <Card 
        className={`p-4 cursor-pointer hover:shadow-glow hover:scale-[1.02] transition-all duration-300 ${cardBg} animate-fade-in border-2 relative z-10`}
        onClick={onClick}
      >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-bold text-lg">{lead.travellerName}</h3>
            <p className="text-sm text-muted-foreground">{lead.tripId}</p>
          </div>
          <Badge className={`${getStatusColor(lead.status)} text-white`}>
            {lead.status}
          </Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{lead.travelState}</span>
          </div>
          
          {lead.travelDate && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {/* ✅ CRITICAL: Use formatTravelDate function */}
              <span className="font-medium">{formatTravelDate(lead.travelDate)}</span>
            </div>
          )}
          
          <div className="flex items-center gap-4 text-muted-foreground">
            {lead.nights && (
              <div className="flex items-center gap-1">
                <Moon className="h-4 w-4" />
                <span>{lead.nights}N</span>
              </div>
            )}
            {lead.pax && (
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{lead.pax}</span>
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

        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleCall}
          >
            <Phone className="h-4 w-4" />
            Call
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleEmail}
          >
            <Mail className="h-4 w-4" />
            Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
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
