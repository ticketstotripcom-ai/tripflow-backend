import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { extractAnyDateFromText, formatDisplayDate, parseFlexibleDate } from "@/lib/dateUtils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MonthlyBookedReportProps {
  leads: SheetLead[];
}

export default function MonthlyBookedReport({ leads }: MonthlyBookedReportProps) {
  const now = new Date();

  // Build last 6 months labels
  const months = Array.from({ length: 6 }).map((_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - idx, 1);
    return { key: `${d.getFullYear()}-${d.getMonth() + 1}`, date: d, label: formatDisplayDate(d).split(' ').slice(1).join(' ') };
  }).reverse();

  const booked = leads.filter((l) => (l.status || '').toLowerCase().includes('booked'));
  const enriched = booked.map((l) => {
    // Prefer booking date from notes; fallback to column AA if present on object; then creation date
    const noteDate = extractAnyDateFromText(l.notes);
    const aaDate = (l as any).timeStamp ? parseFlexibleDate((l as any).timeStamp) : null;
    const baseDate = noteDate || aaDate || parseFlexibleDate(l.dateAndTime) || new Date(0);
    return { ...l, bookingDate: baseDate } as SheetLead & { bookingDate: Date };
  });

  const [activeKey, setActiveKey] = React.useState(months[months.length - 1].key);

  const monthData = React.useMemo(() => {
    const { date } = months.find((m) => m.key === activeKey) || months[months.length - 1];
    const month = date.getMonth();
    const year = date.getFullYear();
    const inMonth = enriched.filter((l) => l.bookingDate.getMonth() === month && l.bookingDate.getFullYear() === year);
    const byConsultant: Record<string, number> = {};
    inMonth.forEach((l) => {
      const c = (l.consultant || 'Unassigned').trim();
      byConsultant[c] = (byConsultant[c] || 0) + 1;
    });
    return { total: inMonth.length, byConsultant };
  }, [activeKey, enriched, months]);

  const activeMonthLabel = months.find((m) => m.key === activeKey)?.label || '';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Monthly Booked With Us</CardTitle>
          <Tabs value={activeKey} onValueChange={setActiveKey}>
            <TabsList className="grid grid-cols-3 md:grid-cols-6">
              {months.map((m) => (
                <TabsTrigger key={m.key} value={m.key} className="text-[10px] md:text-xs">
                  {m.label.split(' ')[0].slice(0, 3)} {m.label.split(' ')[1]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {monthData.total === 0 ? (
          <div className="text-sm text-muted-foreground">No bookings recorded for {activeMonthLabel}.</div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="font-medium">Total: {monthData.total}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(monthData.byConsultant).map(([name, count]) => (
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
