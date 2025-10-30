import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { formatDisplayDate, parseFlexibleDate } from "@/lib/dateUtils";
import { Calendar, MapPin, Timer } from "lucide-react";

interface UpcomingTripsDialogProps {
  open: boolean;
  onClose: () => void;
  leads: SheetLead[];
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function UpcomingTripsDialog({ open, onClose, leads }: UpcomingTripsDialogProps) {
  const today = new Date();
  today.setHours(0,0,0,0);

  const trips = (leads || [])
    .map(l => ({ lead: l, td: parseFlexibleDate(l.travelDate) }))
    .filter(x => x.td && (x.lead.status || '').toLowerCase().includes('booked') && x.td!.getTime() >= today.getTime())
    .sort((a, b) => (a.td!.getTime() - b.td!.getTime()))
    .map(x => x.lead);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-indigo-600">Upcoming Trips ({trips.length})</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {trips.map((lead) => {
            const td = parseFlexibleDate(lead.travelDate)!;
            const diff = daysUntil(td);
            const indicator = diff === 0 ? 'Starts today' : `${diff} day${diff === 1 ? '' : 's'} remaining`;

            const pr = (lead.priority || '').toLowerCase();
            const prColor = pr === 'high' ? 'border-red-400' : pr === 'low' ? 'border-green-400' : 'border-amber-400';

            return (
              <Card key={`${lead.tripId}-${lead.travellerName}`} className={`p-4 border-2 ${prColor}`}>
                <div className="space-y-2">
                  <div className="font-bold text-base truncate">{lead.travellerName}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{lead.travelState}</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="truncate">{formatDisplayDate(lead.travelDate)}</span>
                  </div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Timer className="h-4 w-4 text-amber-600" />
                    <span className={diff === 0 ? 'text-green-600' : 'text-amber-700'}>{indicator}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {trips.length === 0 && (
          <div className="text-center text-muted-foreground py-12">No upcoming trips</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
