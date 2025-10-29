import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { extractAnyDateFromText, formatDisplayDate, parseFlexibleDate } from "@/lib/dateUtils";

interface MonthlyBookedReportProps {
  leads: SheetLead[];
}

export default function MonthlyBookedReport({ leads }: MonthlyBookedReportProps) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const isInMonth = (d: Date) => d.getMonth() === month && d.getFullYear() === year;

  const booked = leads.filter((l) => (l.status || '').toLowerCase().includes('booked'));
  const enriched = booked.map((l) => {
    const noteDate = extractAnyDateFromText(l.notes);
    const baseDate = noteDate || parseFlexibleDate(l.dateAndTime) || new Date(0);
    return { ...l, bookingDate: baseDate } as SheetLead & { bookingDate: Date };
  });
  const thisMonth = enriched.filter((l) => isInMonth(l.bookingDate));

  const byConsultant: Record<string, number> = {};
  thisMonth.forEach((l) => {
    const c = (l.consultant || 'Unassigned').trim();
    byConsultant[c] = (byConsultant[c] || 0) + 1;
  });

  const total = thisMonth.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Monthly Booked With Us ({formatDisplayDate(new Date(year, month, 1)).split(' ').slice(1).join(' ')})</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="text-sm text-muted-foreground">No bookings recorded this month.</div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="font-medium">Total: {total}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(byConsultant).map(([name, count]) => (
                <div key={name} className="flex items-center justify-between border rounded-md p-2">
                  <div className="truncate max-w-[12rem]">{name}</div>
                  <div className="font-semibold">{count}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
