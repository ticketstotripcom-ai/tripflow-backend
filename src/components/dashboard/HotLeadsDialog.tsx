import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SheetLead } from "@/lib/googleSheets";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageCircle, Calendar, MapPin, Users, Moon, Flame } from "lucide-react";
import LeadDetailsDialog from "./LeadDetailsDialog";
import { formatDisplayDate } from "@/lib/dateUtils";

interface HotLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  leads: SheetLead[];
}

// Use global date util for consistent display

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
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-2xl text-orange-600 flex items-center gap-2">
              <Flame className="h-6 w-6" />
              Hot Leads ({leads.length})
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 pb-6">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <Flame className="h-20 w-20 text-muted-foreground opacity-20 mb-4" />
                <p className="text-lg text-muted-foreground font-medium">No hot leads yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Leads marked as "Hot" will appear here
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
                {leads.map((lead) => (
                  <Card 
                    key={lead.tripId || lead.phone}
                    className="p-4 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-2 border-orange-200 dark:border-orange-800"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base flex items-center gap-2 truncate">
                            <span className="truncate">{lead.travellerName}</span>
                            <Flame className="h-4 w-4 text-orange-600 flex-shrink-0" />
                          </h3>
                          {lead.tripId && (
                            <p className="text-xs text-muted-foreground truncate">{lead.tripId}</p>
                          )}
                        </div>
                        <Badge className="bg-orange-500 text-white text-xs whitespace-nowrap ml-2">
                          Hot
                        </Badge>
                      </div>

                      {/* Details */}
                      <div className="space-y-2 text-sm">
                        {lead.travelState && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{lead.travelState}</span>
                          </div>
                        )}
                        
                        {lead.travelDate && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate text-xs">{formatDisplayDate(lead.travelDate)}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-muted-foreground">
                          {lead.nights && (
                            <div className="flex items-center gap-1">
                              <Moon className="h-3.5 w-3.5" />
                              <span className="text-xs">{lead.nights}N</span>
                            </div>
                          )}
                          {lead.pax && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              <span className="text-xs">{lead.pax}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Contact */}
                      {lead.phone && (
                        <p className="text-xs text-muted-foreground truncate">📱 {lead.phone}</p>
                      )}

                      {/* Remarks */}
                      {lead.remarks && (
                        <div className="border-t pt-2">
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {lead.remarks}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-1.5 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs px-2"
                          onClick={(e) => handleCall(e, lead.phone)}
                        >
                          <Phone className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs px-2"
                          onClick={(e) => handleEmail(e, lead.email)}
                        >
                          <Mail className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs px-2"
                          onClick={(e) => handleWhatsApp(e, lead.phone)}
                        >
                          <MessageCircle className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Consultant */}
                      {lead.consultant && (
                        <div className="text-xs text-muted-foreground truncate">
                          👤 {lead.consultant}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
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
            setSelectedLead(null);
            onClose();
          }}
        />
      )}
    </>
  );
};

export default HotLeadsDialog;
