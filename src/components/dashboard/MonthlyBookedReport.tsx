import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetLead } from "@/lib/googleSheets";
import { normalizeStatus, isBookedStatus } from "@/lib/leadStatus";
import {
  extractAnyDateFromText,
  formatDisplayDate,
  parseFlexibleDate,
} from "@/lib/dateUtils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

interface MonthlyBookedReportProps {
  leads: SheetLead[];
}

interface EnrichedBooking extends SheetLead {
  bookingDate: Date;
  createdDate?: Date | null;
}

export default function MonthlyBookedReport({ leads }: MonthlyBookedReportProps) {
  const now = new Date();

  // 🧠 Precompute last 6 months (oldest → newest)
  const months = React.useMemo(() => {
    const out: {
      key: string;
      date: Date;
      labelFull: string;
      labelShort: string;
    }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const labelFull = formatDisplayDate(d); // e.g. "01 Jan 2025"
      const [day, month, year] = labelFull.split(" ");
      const labelShort = `${month} ${year}`; // e.g. "Jan 2025"
      out.push({
        key: `${d.getFullYear()}-${d.getMonth() + 1}`,
        date: d,
        labelFull,
        labelShort,
      });
    }
    return out;
  }, [now]);

  // 🧠 Extract all "booked" leads once, in a normalized way
  const enrichedBookings: EnrichedBooking[] = React.useMemo(() => {
    const bookedLeads = leads.filter((l) => {
      const status = normalizeStatus((l as any).leadStatus || l.status || "");
      return (
        isBookedStatus(status) ||
        status === "booked with us" ||
        status === "booked"
      );
    });

    return bookedLeads
      .map((l) => {
        // 1️⃣ bookingDate: priority = timestamp → travelDate → dateAndTime → any date in notes
        const bookingDateRaw =
          parseFlexibleDate((l as any).timeStamp || (l as any).timestamp) ||
          parseFlexibleDate(l.travelDate) ||
          parseFlexibleDate(l.dateAndTime) ||
          extractAnyDateFromText(l.notes || "");

        if (!bookingDateRaw) return null;

        const bookingDate = new Date(bookingDateRaw);
        if (isNaN(bookingDate.getTime())) return null;

        // 2️⃣ createdDate = first contact / lead creation (best-effort)
        const createdDate =
          parseFlexibleDate(l.dateAndTime) ||
          parseFlexibleDate(l.travelDate) ||
          extractAnyDateFromText(l.notes || "") ||
          null;

        return {
          ...l,
          bookingDate,
          createdDate,
        };
      })
      .filter((x): x is EnrichedBooking => !!x && !isNaN(x.bookingDate.getTime()));
  }, [leads]);

  // 🧠 Default active month = latest in list
  const [activeKey, setActiveKey] = React.useState(
    () => months[months.length - 1]?.key
  );

  // 🧠 Derive metrics for the active month
  const {
    totalBookings,
    byConsultant,
    conversionRate,
    avgDaysToBook,
    uniqueConsultants,
    totalLeadsInMonth,
    topConsultant,
    topConsultantCount,
  } = React.useMemo(() => {
    const activeMonth =
      months.find((m) => m.key === activeKey) || months[months.length - 1];

    const monthIndex = activeMonth.date.getMonth();
    const year = activeMonth.date.getFullYear();

    // All leads created in that month (for conversion rate)
    const leadsInMonth = leads.filter((l) => {
      const created =
        parseFlexibleDate(l.dateAndTime) ||
        parseFlexibleDate(l.travelDate) ||
        extractAnyDateFromText(l.notes || "");
      if (!created) return false;
      const d = new Date(created);
      return d.getMonth() === monthIndex && d.getFullYear() === year;
    });

    // Bookings in that month
    const bookingsInMonth = enrichedBookings.filter((l) => {
      const bd = l.bookingDate;
      return bd.getMonth() === monthIndex && bd.getFullYear() === year;
    });

    const byConsultantMap: Record<string, number> = {};
    let totalDays = 0;
    let durationCount = 0;

    bookingsInMonth.forEach((l) => {
      const consultant = (l.consultant || "Unassigned").trim() || "Unassigned";
      byConsultantMap[consultant] = (byConsultantMap[consultant] || 0) + 1;

      // Days from created → booking, where possible
      if (l.createdDate) {
        const diffMs = l.bookingDate.getTime() - l.createdDate.getTime();
        if (!isNaN(diffMs) && diffMs > 0) {
          totalDays += Math.round(diffMs / (1000 * 60 * 60 * 24));
          durationCount += 1;
        }
      }
    });

    const totalBookingsMonth = bookingsInMonth.length;
    const totalLeadsMonth = leadsInMonth.length;
    const conversion =
      totalLeadsMonth > 0
        ? Math.round((totalBookingsMonth / totalLeadsMonth) * 100)
        : 0;

    const avgDays =
      durationCount > 0 ? Math.round(totalDays / durationCount) : 0;

    // Top consultant
    let topName = "";
    let topCount = 0;
    Object.entries(byConsultantMap).forEach(([name, count]) => {
      if (count > topCount) {
        topCount = count;
        topName = name;
      }
    });

    return {
      totalBookings: totalBookingsMonth,
      byConsultant: byConsultantMap,
      conversionRate: conversion,
      avgDaysToBook: avgDays,
      uniqueConsultants: Object.keys(byConsultantMap).length,
      totalLeadsInMonth: totalLeadsMonth,
      topConsultant: topName,
      topConsultantCount: topCount,
    };
  }, [activeKey, months, enrichedBookings, leads]);

  const activeMonthLabel =
    months.find((m) => m.key === activeKey)?.labelShort || "";

  const consultantEntries = React.useMemo(
    () => Object.entries(byConsultant).sort((a, b) => b[1] - a[1]),
    [byConsultant]
  );

  return (
    <Card className="shadow-soft relative overflow-hidden">
      {/* Soft gradient ribbon */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs">
                ✈️
              </span>
              Monthly Booked With Us
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Bookings by consultant · {activeMonthLabel || "—"}
            </p>
          </div>

          {/* Month tabs */}
          <Tabs
            value={activeKey}
            onValueChange={setActiveKey}
            className="max-w-[220px] sm:max-w-xs"
          >
            <TabsList className="grid grid-cols-3 sm:grid-cols-6 bg-muted/70">
              {months.map((m) => (
                <TabsTrigger
                  key={m.key}
                  value={m.key}
                  className="text-[9px] sm:text-[10px] px-1 py-1 data-[state=active]:bg-primary/90 data-[state=active]:text-primary-foreground"
                >
                  {m.labelShort.split(" ")[0].slice(0, 3)}{" "}
                  {m.labelShort.split(" ")[1]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-[13px]">
          <div className="rounded-md border bg-card/60 px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground">Bookings</div>
            <div className="font-semibold text-primary text-sm">
              {totalBookings || 0}
            </div>
          </div>
          <div className="rounded-md border bg-card/60 px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground">
              Conversion
            </div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
              {conversionRate}%{" "}
              <span className="text-[11px] text-muted-foreground">
                of {totalLeadsInMonth || 0} leads
              </span>
            </div>
          </div>
          <div className="rounded-md border bg-card/60 px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground">
              Avg time to book
            </div>
            <div className="font-semibold text-sm">
              {avgDaysToBook > 0 ? `${avgDaysToBook} days` : "—"}
            </div>
          </div>
          <div className="rounded-md border bg-card/60 px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground">
              Active consultants
            </div>
            <div className="font-semibold text-sm">
              {uniqueConsultants || 0}
            </div>
          </div>
        </div>

        {/* Highlight: Top consultant */}
        {topConsultant && totalBookings > 0 && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            🏆 Top:{" "}
            <span className="font-medium text-foreground">
              {topConsultant}
            </span>{" "}
            with{" "}
            <span className="font-semibold">
              {topConsultantCount} booking
              {topConsultantCount > 1 ? "s" : ""}
            </span>
            .
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-1">
        {totalBookings === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No <span className="font-medium">booked with us</span> records for{" "}
            {activeMonthLabel || "this month"} yet.
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Mini "distribution bar" */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Consultant share</span>
                <span>{totalBookings} total bookings</span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {consultantEntries.map(([name, count], idx) => {
                  const width = (count / totalBookings) * 100;
                  const palette = [
                    "bg-indigo-500",
                    "bg-emerald-500",
                    "bg-amber-500",
                    "bg-sky-500",
                    "bg-rose-500",
                    "bg-violet-500",
                  ];
                  const color = palette[idx % palette.length];
                  return (
                    <div
                      key={name}
                      className={`${color} h-full transition-all duration-700`}
                      style={{ width: `${width}%` }}
                      title={`${name}: ${count}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Consultant cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {consultantEntries.map(([name, count], idx) => {
                const percent =
                  totalBookings > 0
                    ? Math.round((count / totalBookings) * 100)
                    : 0;
                const palette = [
                  "from-indigo-50 to-indigo-100/50 dark:from-indigo-900/40 dark:to-slate-900",
                  "from-emerald-50 to-emerald-100/50 dark:from-emerald-900/40 dark:to-slate-900",
                  "from-amber-50 to-amber-100/50 dark:from-amber-900/40 dark:to-slate-900",
                  "from-sky-50 to-sky-100/50 dark:from-sky-900/40 dark:to-slate-900",
                  "from-rose-50 to-rose-100/50 dark:from-rose-900/40 dark:to-slate-900",
                  "from-violet-50 to-violet-100/50 dark:from-violet-900/40 dark:to-slate-900",
                ];
                const bg = palette[idx % palette.length];

                return (
                  <div
                    key={name}
                    className={`
                      rounded-md border p-2 
                      bg-gradient-to-br ${bg}
                      flex flex-col gap-1 
                      animate-fade-in
                    `}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs font-medium">
                        {name}
                      </div>
                      <div className="text-sm font-semibold">
                        {count}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{percent}% of this month</span>
                      <span>
                        {totalBookings} total
                      </span>
                    </div>
                    <Progress value={percent} className="mt-1 h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
