import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { parseFlexibleDate } from "@/lib/dateUtils";

interface CustomerJourneyProps {
  leads: SheetLead[];
}

function avgDays(durations: number[]): number {
  if (durations.length === 0) return 0;
  const sum = durations.reduce((a, b) => a + b, 0);
  return Math.round(sum / durations.length);
}

export default function CustomerJourney({ leads }: CustomerJourneyProps) {
  const total = leads.length;
  const newCount = leads.filter((l) => (l.status || '') === '' || (l.status || '').toLowerCase().includes('unfollowed')).length;
  const workingCount = leads.filter((l) => (l.status || '').toLowerCase().includes('working') || (l.status || '').toLowerCase().includes('follow-up') || (l.status || '').toLowerCase().includes('whatsapp') || (l.status || '').toLowerCase().includes('proposal') || (l.status || '').toLowerCase().includes('negotiations')).length;
  const hotCount = leads.filter((l) => (l.status || '').toLowerCase().includes('hot')).length;
  const bookedWithUs = leads.filter((l) => (l.status || '').toLowerCase().includes('booked with us'));
  const bookedOutside = leads.filter((l) => (l.status || '').toLowerCase().includes('booked outside'));
  const cancelled = leads.filter((l) => (l.status || '').toLowerCase().includes('cancel') || (l.status || '').toLowerCase().includes('postponed'));

  const creationDates = leads.map((l) => parseFlexibleDate(l.dateAndTime)).filter(Boolean) as Date[];
  const bookingDurations: number[] = bookedWithUs
    .map((l) => {
      const start = parseFlexibleDate(l.dateAndTime);
      const end = parseFlexibleDate(l.travelDate) || new Date();
      if (!start) return null;
      return Math.max(0, Math.round(((end?.getTime() || Date.now()) - start.getTime()) / (1000 * 60 * 60 * 24)));
    })
    .filter((v): v is number => v !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Customer Journey</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="text-sm text-muted-foreground">No data available.</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="border rounded-md p-2">New: <span className="font-semibold">{newCount}</span></div>
              <div className="border rounded-md p-2">Working: <span className="font-semibold">{workingCount}</span></div>
              <div className="border rounded-md p-2">Hot: <span className="font-semibold">{hotCount}</span></div>
              <div className="border rounded-md p-2">Booked (us): <span className="font-semibold">{bookedWithUs.length}</span></div>
              <div className="border rounded-md p-2">Booked outside: <span className="font-semibold">{bookedOutside.length}</span></div>
              <div className="border rounded-md p-2">Dropped: <span className="font-semibold">{cancelled.length}</span></div>
            </div>
            <div className="border rounded-md p-3">
              <div>Avg days to booking (approx): <span className="font-semibold">{avgDays(bookingDurations)}</span></div>
              <div className="text-xs text-muted-foreground">Based on creation date to travel/booking date.</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
