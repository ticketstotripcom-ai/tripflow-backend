import { Card } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { formatDisplayDate, parseFlexibleDate } from "@/lib/dateUtils";
import { Calendar, MapPin, Timer } from "lucide-react";

interface UpcomingTripsProps {
  leads: SheetLead[];
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const UpcomingTrips = ({ leads }: UpcomingTripsProps) => {
  const today = new Date();
  today.setHours(0,0,0,0);

  const trips = (leads || [])
    .map(l => ({ lead: l, td: parseFlexibleDate(l.travelDate) }))
    .filter(x => x.td && (x.lead.status || '').toLowerCase().includes('booked') && x.td!.getTime() >= today.getTime())
    .sort((a, b) => (a.td!.getTime() - b.td!.getTime()))
    .map(x => x.lead);

  if (trips.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Upcoming Trips</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {trips.map((lead) => {
          const td = parseFlexibleDate(lead.travelDate)!;
          const diff = daysUntil(td);
          const indicator = diff === 0 ? '🌍 Starts today' : `⏳ ${diff} day${diff === 1 ? '' : 's'} remaining`;
          return (
            <Card key={`${lead.tripId}-${lead.travellerName}`} className="p-4 border-2">
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
    </div>
  );
};

export default UpcomingTrips;
