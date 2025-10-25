import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SheetLead } from "@/lib/googleSheets";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageCircle, Calendar, MapPin, Users, Moon, Flame } from "lucide-react";
import LeadDetailsDialog from "./LeadDetailsDialog";

interface HotLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  leads: SheetLead[];
}

/**
 * Format date as "6 November 2025"
 */
const formatTravelDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  try {
    const s = String(dateStr).trim();
    const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const mm = Number(match[1]);
      const dd = Number(match[2]);
      let yyyy = Number(match[3]);
      
      if (yyyy < 100) {
        yyyy = yyyy < 50 ? 2000 + yyyy : 1900 + yyyy;
      }
      
      const date = new Date(yyyy, mm - 1, dd);
      
      if (isNaN(date.getTime())) {
        return dateStr;
      }
      
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    
    const date = new Date(s);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    
    return dateStr;
  } catch (e) {
    return dateStr;
  }
};

const HotLeadsDialog = ({ open, onClose, leads }: HotLeadsDialogProps) => {
  const [selectedLead, setSelectedLead] = useState<SheetLead | null>(null);

  const handleCall = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    window.location.href = `tel:${phone}`;
  };

  const handleEmail = (e: React.MouseEvent, email: string) => {
    e.stopPropagation();
    window.location.href = `mailto:${email}`;
  };

  const handleWhatsApp = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl text-orange-600 flex items-center gap-2">
              <Flame className="h-6 w-6" />
              Hot Leads ({leads.length})
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 pb-4">
              {leads.length === 0 ? (
                <div className="text-center py-12">
                  <Flame className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <p className="text-lg text-muted-foreground">No hot leads yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Leads marked as "Hot" will appear here
                  </p>
                </div>
              ) : (
                leads.map((lead) => (
                  <Card 
                    key={lead.tripId || lead.phone}
                    className="p-4 hover:shadow-lg transition-all duration-300 cursor-pointer hover:scale-[1.02] bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-orange-200 dark:border-orange-800"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg flex items-center gap-2">
                            {lead.travellerName}
                            <Flame className="h-4 w-4 text-orange-600" />
                          </h3>
                          {lead.tripId && (
                            <p className="text-sm text-muted-foreground">{lead.tripId}</p>
                          )}
                        </div>
                        <Badge className="bg-orange-500 text-white">
                          {lead.status}
                        </Badge>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {lead.travelState && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{lead.travelState}</span>
                          </div>
                        )}
                        
                        {lead.travelDate && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{formatTravelDate(lead.travelDate)}</span>
                          </div>
                        )}
                        
                        {lead.nights && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Moon className="h-4 w-4 flex-shrink-0" />
                            <span>{lead.nights}N</span>
                          </div>
                        )}
                        
                        {lead.pax && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-4 w-4 flex-shrink-0" />
                            <span>{lead.pax} Pax</span>
                          </div>
                        )}
                      </div>

                      {/* Contact Info */}
                      <div className="space-y-1 text-sm">
                        {lead.phone && (
                          <p className="text-muted-foreground">📱 {lead.phone}</p>
                        )}
                        {lead.email && (
                          <p className="text-muted-foreground truncate">✉️ {lead.email}</p>
                        )}
                      </div>

                      {/* Remarks */}
                      {lead.remarks && (
                        <div className="border-t pt-2">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold">Remarks:</span> {lead.remarks}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={(e) => handleCall(e, lead.phone)}
                        >
                          <Phone className="h-4 w-4" />
                          Call
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={(e) => handleEmail(e, lead.email)}
                        >
                          <Mail className="h-4 w-4" />
                          Email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={(e) => handleWhatsApp(e, lead.phone)}
                        >
                          <MessageCircle className="h-4 w-4" />
                          WhatsApp
                        </Button>
                      </div>

                      {/* Consultant */}
                      {lead.consultant && (
                        <div className="text-xs text-muted-foreground">
                          Assigned to: <span className="font-medium">{lead.consultant}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Lead Details Dialog */}
      {selectedLead && (
        <LeadDetailsDialog
          lead={selectedLead}
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => {
            // Refresh leads after update
            setSelectedLead(null);
            onClose();
          }}
        />
      )}
    </>
  );
};

export default HotLeadsDialog;
