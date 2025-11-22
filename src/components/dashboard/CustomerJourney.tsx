import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { parseFlexibleDate } from "@/lib/dateUtils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface CustomerJourneyProps {
  leads: SheetLead[];
}

function avgDays(durations: number[]): number {
  if (durations.length === 0) return 0;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

export default function CustomerJourney({ leads }: CustomerJourneyProps) {
  const total = leads.length;
  const statusOf = (l: SheetLead) => (l.status || "").toLowerCase();

  const stageNew = leads.filter(
    (l) => statusOf(l) === "" || statusOf(l).includes("unfollowed")
  );
  const stageWorking = leads.filter((l) =>
    ["working", "follow-up", "whatsapp", "proposal", "negotiations"].some((k) =>
      statusOf(l).includes(k)
    )
  );
  const stageHot = leads.filter((l) => statusOf(l).includes("hot"));
  const stageBookedUs = leads.filter((l) =>
    statusOf(l).includes("booked with us")
  );
  const stageBookedOutside = leads.filter((l) =>
    statusOf(l).includes("booked outside")
  );
  const stageDropped = leads.filter(
    (l) =>
      statusOf(l).includes("cancel") ||
      statusOf(l).includes("postponed") ||
      statusOf(l).includes("lost")
  );

  const now = new Date();
  const toDays = (ms: number) => Math.max(0, Math.round(ms / 86400000));

  const avgToBookingDays = avgDays(
    stageBookedUs
      .map((l) => {
        const start = parseFlexibleDate(l.dateAndTime);
        const end = parseFlexibleDate(l.travelDate) || now;
        if (!start) return null;
        return toDays(end.getTime() - start.getTime());
      })
      .filter((n): n is number => n !== null)
  );

  const dropOffRate =
    total > 0
      ? Math.round(
          ((stageDropped.length + stageBookedOutside.length) / total) * 100
        )
      : 0;

  const stages = [
    {
      key: "Lead",
      count: stageNew.length,
      color: "from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800",
      tooltip: "New leads received",
    },
    {
      key: "Working",
      count: stageWorking.length,
      color: "from-blue-200 to-blue-300 dark:from-blue-700 dark:to-blue-800",
      tooltip: "In progress",
    },
    {
      key: "Hot",
      count: stageHot.length,
      color: "from-orange-200 to-orange-300 dark:from-orange-700 dark:to-orange-800",
      tooltip: "High intent",
    },
    {
      key: "Booked",
      count: stageBookedUs.length,
      color: "from-green-200 to-green-300 dark:from-green-700 dark:to-green-800",
      tooltip: "Converted",
    },
    {
      key: "Closed",
      count: stageBookedOutside.length,
      color: "from-emerald-200 to-emerald-300 dark:from-emerald-700 dark:to-emerald-800",
      tooltip: "Booked outside",
    },
    {
      key: "Lost",
      count: stageDropped.length,
      color: "from-rose-200 to-rose-300 dark:from-rose-700 dark:to-rose-800",
      tooltip: "Cancelled / Lost",
    },
  ];

  return (
    <Card className="shadow-soft backdrop-blur-sm bg-card/60 animate-fade-in">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="bg-gradient-primary bg-clip-text text-transparent font-bold">
            Customer Journey
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="overflow-x-hidden">
        {total === 0 ? (
          <div className="text-sm text-muted-foreground animate-fade-in">
            No data available.
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            {/* ===== Metrics Row ===== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border shadow-sm bg-white/60 dark:bg-black/30 backdrop-blur-sm animate-fade-in hover:shadow-glow transition">
                Avg Conversion:
                <span className="font-semibold ml-1">
                  {avgToBookingDays} days
                </span>
              </div>

              <div className="p-3 rounded-lg border shadow-sm bg-white/60 dark:bg-black/30 backdrop-blur-sm animate-fade-in hover:shadow-glow transition">
                Drop-off:
                <span className="font-semibold ml-1">{dropOffRate}%</span>
              </div>

              <div className="p-3 rounded-lg border shadow-sm bg-white/60 dark:bg-black/30 backdrop-blur-sm animate-fade-in hover:shadow-glow transition">
                Total:
                <span className="font-semibold ml-1">{total}</span>
              </div>

              <div className="p-3 rounded-lg border shadow-sm bg-white/60 dark:bg-black/30 backdrop-blur-sm animate-fade-in hover:shadow-glow transition">
                Booked:
                <span className="font-semibold ml-1">
                  {stageBookedUs.length}
                </span>
              </div>
            </div>

            <TooltipProvider delayDuration={0}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stages.map((s, i) => {
                  const percent = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  return (
                    <Tooltip key={s.key}>
                      <TooltipTrigger asChild>
                        <div className={cn("p-3 rounded-lg border shadow-sm bg-white/60 dark:bg-black/30 backdrop-blur-sm animate-fade-in hover:shadow-glow transition")}
                          style={{ animationDelay: `${i * 80}ms` }}>
                          <div className="text-[11px] font-semibold truncate">{s.key}</div>
                          <div className="text-[11px] text-muted-foreground">{s.count}</div>
                          <Progress value={percent} className="h-1 mt-2 transition-all duration-500" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="animate-fade-in">
                        <div className="text-xs">{s.tooltip} • {percent}% of total</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            <div className="text-xs text-muted-foreground mt-2">
              Hover to see percent of total. Conversion and stage time are
              approximated.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
