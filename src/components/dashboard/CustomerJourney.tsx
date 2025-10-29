import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { parseFlexibleDate } from "@/lib/dateUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

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
  const statusOf = (l: SheetLead) => (l.status || '').toLowerCase();
  const stageNew = leads.filter((l) => statusOf(l) === '' || statusOf(l).includes('unfollowed'));
  const stageWorking = leads.filter((l) => ['working', 'follow-up', 'whatsapp', 'proposal', 'negotiations'].some((k) => statusOf(l).includes(k)));
  const stageHot = leads.filter((l) => statusOf(l).includes('hot'));
  const stageBookedUs = leads.filter((l) => statusOf(l).includes('booked with us'));
  const stageBookedOutside = leads.filter((l) => statusOf(l).includes('booked outside'));
  const stageDropped = leads.filter((l) => statusOf(l).includes('cancel') || statusOf(l).includes('postponed') || statusOf(l).includes('lost'));

  const toDays = (ms: number) => Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  const now = new Date();

  const avgToBookingDays = avgDays(
    stageBookedUs
      .map((l) => {
        const start = parseFlexibleDate(l.dateAndTime);
        const end = parseFlexibleDate(l.travelDate) || now;
        if (!start) return null;
        return toDays((end?.getTime() || Date.now()) - start.getTime());
      })
      .filter((v): v is number => v !== null)
  );

  const dropOffRate = total > 0 ? Math.round(((stageDropped.length + stageBookedOutside.length) / total) * 100) : 0;

  const stages = [
    { key: 'Lead', count: stageNew.length, color: 'from-slate-200 to-slate-300', tooltip: 'New leads received' },
    { key: 'Working', count: stageWorking.length, color: 'from-blue-200 to-blue-300', tooltip: 'In progress: follow-ups, proposals' },
    { key: 'Hot', count: stageHot.length, color: 'from-orange-200 to-orange-300', tooltip: 'High intent leads' },
    { key: 'Booked', count: stageBookedUs.length, color: 'from-green-200 to-green-300', tooltip: 'Converted with us' },
    { key: 'Closed', count: stageBookedOutside.length, color: 'from-emerald-200 to-emerald-300', tooltip: 'Booked outside' },
    { key: 'Lost', count: stageDropped.length, color: 'from-rose-200 to-rose-300', tooltip: 'Cancelled/Postponed/Lost' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Customer Journey</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="text-sm text-muted-foreground">No data available.</div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="border rounded-md p-2 bg-gradient-to-br from-indigo-50 to-white">
                Avg conversion time: <span className="font-semibold">{avgToBookingDays} days</span>
              </div>
              <div className="border rounded-md p-2 bg-gradient-to-br from-rose-50 to-white">
                Drop-off rate: <span className="font-semibold">{dropOffRate}%</span>
              </div>
              <div className="border rounded-md p-2">Total: <span className="font-semibold">{total}</span></div>
              <div className="border rounded-md p-2">Booked: <span className="font-semibold">{stageBookedUs.length}</span></div>
            </div>

            {/* Gradient pipeline */}
            <TooltipProvider>
              <div className="flex items-stretch gap-2">
                {stages.map((s) => {
                  const percent = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  return (
                    <Tooltip key={s.key}>
                      <TooltipTrigger asChild>
                        <div className="flex-1 min-w-[60px]">
                          <div className={`h-3 rounded-md bg-gradient-to-r ${s.color}`} />
                          <div className="mt-1 text-[11px] flex items-center justify-between">
                            <span className="font-medium">{s.key}</span>
                            <span className="text-muted-foreground">{s.count}</span>
                          </div>
                          <Progress value={percent} className="h-1 mt-1" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          {s.tooltip} · {percent}% of total
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            {/* Subtext */}
            <div className="text-xs text-muted-foreground">Tooltips show share per stage. Days in stage approximated from lead creation to current/booking date.</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
