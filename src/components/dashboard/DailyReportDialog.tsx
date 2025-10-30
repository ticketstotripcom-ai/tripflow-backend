import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SheetLead } from "@/lib/googleSheets";
import { authService } from "@/lib/authService";
import { isBookedStatus, isCancelCategoryStatus, isNewCategoryStatus, normalizeStatus } from "@/lib/leadStatus";
import { Clipboard, MessageCircle, Users, Award, RefreshCw } from "lucide-react";
import { DateRangePicker, DateRange } from "@/components/ui/date-range-picker";
import { parseFlexibleDate, formatDisplayDate, extractAnyDateFromText } from "@/lib/dateUtils";

type Mode = "consultant" | "admin";

interface DailyReportDialogProps {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  leads: SheetLead[];
  consultants?: string[];
}

interface Metrics {
  total: number;
  new: number;
  followUps: number;
  proposals: number;
  whatsapp: number;
  hot: number;
  booked: number;
  cancel: number;
  highlights: {
    bookedNames: string[];
    hotNames: string[];
    proposalNames: string[];
  };
}

// Date helpers now handled via range only

function computeMetrics(leads: SheetLead[]): Metrics {
  const total = leads.length;
  let newCount = 0;
  let followUps = 0;
  let proposals = 0;
  let whatsapp = 0;
  let hot = 0;
  let booked = 0;
  let cancel = 0;
  const bookedNames: string[] = [];
  const hotNames: string[] = [];
  const proposalNames: string[] = [];

  for (const l of leads) {
    const status = normalizeStatus(l.status);
    if (isNewCategoryStatus(status)) newCount++;
    if (status.includes("follow-up")) followUps++;
    if (status.includes("proposal")) {
      proposals++;
      if (l.travellerName) proposalNames.push(l.travellerName);
    }
    if (status.includes("whatsapp")) whatsapp++;
    if (status.includes("hot")) {
      hot++;
      if (l.travellerName) hotNames.push(l.travellerName);
    }
    if (isBookedStatus(status)) {
      booked++;
      if (l.travellerName) bookedNames.push(l.travellerName);
    }
    if (isCancelCategoryStatus(status)) cancel++;
  }

  return {
    total,
    new: newCount,
    followUps,
    proposals,
    whatsapp,
    hot,
    booked,
    cancel,
    highlights: { bookedNames, hotNames, proposalNames },
  };
}

function computeScore(m: Metrics): number {
  const score = m.booked * 10 + m.hot * 3 + m.proposals * 2 + m.followUps * 1 + m.whatsapp * 0.5 + m.new * 0.2 - m.cancel * 1;
  return Math.max(0, Math.round(score));
}

// Derive a 0-10 rating automatically from metrics
function computeRating(m: Metrics): number {
  // Weighted towards outcomes while staying within 0..10
  const raw = m.booked * 3 + m.hot * 1 + m.proposals * 1 + m.followUps * 0.5 + m.whatsapp * 0.2 - m.cancel * 0.5;
  const clamped = Math.max(0, Math.min(10, Math.round(raw)));
  return clamped;
}

function formatConsultantReport(dateStr: string, consultant: string, metrics: Metrics, rating: number, notes: string): string {
  const lines: string[] = [];
  lines.push(`Daily Report — ${dateStr}`);
  lines.push(`Consultant: ${consultant}`);
  lines.push("");
  lines.push("Summary:");
  lines.push(`- New Leads: ${metrics.new}`);
  lines.push(`- Follow-ups: ${metrics.followUps}`);
  lines.push(`- Proposals Shared: ${metrics.proposals}`);
  lines.push(`- WhatsApp Sent: ${metrics.whatsapp}`);
  lines.push(`- Hot Leads: ${metrics.hot}`);
  lines.push(`- Booked: ${metrics.booked}`);
  lines.push(`- Cancellations/Postponed/Outside: ${metrics.cancel}`);
  if (metrics.highlights.bookedNames.length) {
    lines.push("");
    lines.push(`Booked: ${metrics.highlights.bookedNames.slice(0, 5).join(", ")}`);
  }
  if (metrics.highlights.hotNames.length) {
    lines.push(`Hot Leads: ${metrics.highlights.hotNames.slice(0, 5).join(", ")}`);
  }
  if (metrics.highlights.proposalNames.length) {
    lines.push(`Proposals: ${metrics.highlights.proposalNames.slice(0, 5).join(", ")}`);
  }
  lines.push("");
  lines.push(`Rating: ${rating}/10`);
  if (notes?.trim()) {
    lines.push(`Notes: ${notes.trim()}`);
  }
  return lines.join("\n");
}

function formatTeamReport(dateStr: string, entries: Array<{ name: string; metrics: Metrics; rating: number; score: number }>, notes: string): string {
  const lines: string[] = [];
  lines.push(`Daily Team Report — ${dateStr}`);
  lines.push("");
  lines.push("Ranking:");
  entries.forEach((e, idx) => {
    lines.push(`${idx + 1}. ${e.name} — Leads ${e.metrics.total}, Score ${e.score}, Booked ${e.metrics.booked}, Hot ${e.metrics.hot}, Proposals ${e.metrics.proposals}, Follow-ups ${e.metrics.followUps}, New ${e.metrics.new}, WA ${e.metrics.whatsapp}, Cancel ${e.metrics.cancel}, Rating ${e.rating}/10`);
  });
  lines.push("");
  lines.push("Consultant Summaries:");
  entries.forEach((e) => {
    lines.push("");
    lines.push(`${e.name}`);
    lines.push(`- New Leads: ${e.metrics.new}`);
    lines.push(`- Follow-ups: ${e.metrics.followUps}`);
    lines.push(`- Proposals: ${e.metrics.proposals}`);
    lines.push(`- WhatsApp: ${e.metrics.whatsapp}`);
    lines.push(`- Hot Leads: ${e.metrics.hot}`);
    lines.push(`- Booked: ${e.metrics.booked}`);
    lines.push(`- Cancellations: ${e.metrics.cancel}`);
    if (e.metrics.highlights.bookedNames.length) {
      lines.push(`  Booked: ${e.metrics.highlights.bookedNames.slice(0, 5).join(", ")}`);
    }
    if (e.metrics.highlights.hotNames.length) {
      lines.push(`  Hot: ${e.metrics.highlights.hotNames.slice(0, 5).join(", ")}`);
    }
    if (e.metrics.highlights.proposalNames.length) {
      lines.push(`  Proposals: ${e.metrics.highlights.proposalNames.slice(0, 5).join(", ")}`);
    }
  });
  if (notes?.trim()) {
    lines.push("");
    lines.push(`Notes: ${notes.trim()}`);
  }
  return lines.join("\n");
}

const DailyReportDialog = ({ open, onClose, mode, leads, consultants = [] }: DailyReportDialogProps) => {
  const session = authService.getSession();
  const { toast } = useToast();

  // Default to today's single-day range
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { from: new Date(today), to: new Date(today) };
  });
  const [notes, setNotes] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState<"me" | "full" | "custom">("me");
  const [selectedConsultants, setSelectedConsultants] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (mode === "admin") {
      const initial: Record<string, boolean> = {};
      consultants.forEach((c) => {
        initial[c] = true;
      });
      setSelectedConsultants(initial);
    }
  }, [mode, consultants]);

  const hasRange = !!dateRange.from || !!dateRange.to;

  const leadsForDay = useMemo(() => {
    const from = dateRange.from ? new Date(dateRange.from.setHours(0, 0, 0, 0)) : null;
    const to = dateRange.to ? new Date(dateRange.to.setHours(23, 59, 59, 999)) : null;
    return leads.filter((l) => {
      const nd = extractAnyDateFromText(l.notes) || parseFlexibleDate(l.dateAndTime);
      if (!nd) return false;
      const t = nd.getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  }, [leads, dateRange]);

  const myName = session?.user?.name || "";

  const consultantNamesForDay = useMemo(() => {
    const set = new Set<string>();
    for (const l of leadsForDay) {
      if (l.consultant) set.add(l.consultant);
    }
    return Array.from(set).sort();
  }, [leadsForDay]);

  const consultantMetrics = useMemo(() => {
    if (mode !== "consultant") return null;
    const myLeads = leadsForDay.filter((l) => l.consultant && myName && l.consultant.toLowerCase().includes(myName.toLowerCase()));
    return computeMetrics(myLeads);
  }, [mode, leadsForDay, myName]);

  const consultantAutoRating = useMemo(() => (consultantMetrics ? computeRating(consultantMetrics) : 0), [consultantMetrics]);

  const adminEntries = useMemo(() => {
    if (mode !== "admin") return [] as Array<{ name: string; metrics: Metrics; rating: number; score: number }>;
    let poolNames: string[] = [];
    if (selectionMode === "me") {
      poolNames = myName ? [myName] : [];
    } else if (selectionMode === "full") {
      poolNames = consultantNamesForDay;
    } else {
      poolNames = consultants.filter((c) => selectedConsultants[c]);
    }

    const entries = poolNames.map((name) => {
      const teamLeads = leadsForDay.filter((l) => l.consultant && name && l.consultant.toLowerCase().includes(name.toLowerCase()));
      const m = computeMetrics(teamLeads);
      const score = computeScore(m);
      const r = computeRating(m);
      return { name, metrics: m, rating: r, score };
    });

    entries.sort((a, b) => (b.score - a.score) || (b.metrics.booked - a.metrics.booked));
    return entries;
  }, [mode, selectionMode, consultants, selectedConsultants, consultantNamesForDay, leadsForDay, myName]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Report copied to clipboard" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Copy failed", description: e.message || "Unable to copy" });
    }
  };

  const sendViaWhatsApp = (text: string) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const dateDisplay = useMemo(() => {
    const from = dateRange.from || null;
    const to = dateRange.to || null;
    if (from && to) {
      const same = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth() && from.getDate() === to.getDate();
      return same ? formatDisplayDate(from) : `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`;
    }
    if (from) return `From ${formatDisplayDate(from)}`;
    if (to) return `Until ${formatDisplayDate(to)}`;
    return 'All Dates';
  }, [dateRange]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-gradient-to-b from-white to-indigo-50">
        <DialogHeader className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-lg p-3 sticky top-0 z-10 shadow">
          <DialogTitle className="flex items-center gap-2 text-white">
            {mode === "consultant" ? <Users className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            {mode === "consultant" ? "Daily Report (My Activities)" : "Daily Report (Team Builder)"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1 bg-indigo-50/50 border-indigo-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Date Range</Label>
                <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r || {}); }} />
              </div>

              {mode === "consultant" && (
                <div className="space-y-1">
                  <Label className="text-xs">System Rating (/10)</Label>
                  <div className="flex items-center gap-2 text-sm">
                    <Award className="h-4 w-4 text-amber-500" />
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">{consultantAutoRating}</Badge>
                  </div>
                </div>
              )}

              {mode === "admin" && (
                <div className="space-y-3">
                  <Label className="text-xs">Scope</Label>
                  <Tabs value={selectionMode} onValueChange={(v) => setSelectionMode(v as any)} className="w-full">
                    <TabsList className="grid grid-cols-3">
                      <TabsTrigger value="me">Me</TabsTrigger>
                      <TabsTrigger value="full">Full Team</TabsTrigger>
                      <TabsTrigger value="custom">Custom</TabsTrigger>
                    </TabsList>
                    <TabsContent value="me" />
                    <TabsContent value="full" />
                    <TabsContent value="custom" />
                  </Tabs>

                  {selectionMode === "custom" && (
                    <div>
                      <Label className="text-xs mb-2 block">Select Consultants</Label>
                      <ScrollArea className="h-40 border rounded-md p-2">
                        <div className="space-y-2">
                          {consultants.length === 0 && (
                            <div className="text-xs text-muted-foreground">No consultants found.</div>
                          )}
                          {consultants.map((c) => (
                            <label key={c} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={!!selectedConsultants[c]}
                                onCheckedChange={(val) =>
                                  setSelectedConsultants((prev) => ({ ...prev, [c]: Boolean(val) }))
                                }
                              />
                              <span>{c}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      // no-op, entries recompute automatically when selection changes
                    }}
                  >
                    <RefreshCw className="h-4 w-4" /> Refresh Preview
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Highlights, blockers, plans..." />
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 bg-white border-indigo-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mode === "consultant" && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <Stat label="Total" value={consultantMetrics?.total || 0} color="slate" />
                      <Stat label="New" value={consultantMetrics?.new || 0} color="blue" />
                      <Stat label="Follow-ups" value={consultantMetrics?.followUps || 0} color="violet" />
                      <Stat label="Proposals" value={consultantMetrics?.proposals || 0} color="indigo" />
                      <Stat label="WhatsApp" value={consultantMetrics?.whatsapp || 0} color="emerald" />
                      <Stat label="Hot" value={consultantMetrics?.hot || 0} color="orange" />
                      <Stat label="Booked" value={consultantMetrics?.booked || 0} color="green" />
                      <Stat label="Cancel" value={consultantMetrics?.cancel || 0} color="rose" />
                    </div>
                    {consultantMetrics && (
                      <div className="text-xs space-y-1">
                        <div className="text-muted-foreground">Highlights</div>
                        <div className="flex flex-wrap gap-1">
                          {consultantMetrics.highlights.bookedNames.slice(0, 8).map((n, i) => (
                            <Badge key={`b-${i}`} className="bg-green-100 text-green-800 border-green-200">Booked: {n}</Badge>
                          ))}
                          {consultantMetrics.highlights.hotNames.slice(0, 8).map((n, i) => (
                            <Badge key={`h-${i}`} className="bg-orange-100 text-orange-800 border-orange-200">Hot: {n}</Badge>
                          ))}
                          {consultantMetrics.highlights.proposalNames.slice(0, 8).map((n, i) => (
                            <Badge key={`p-${i}`} className="bg-indigo-100 text-indigo-800 border-indigo-200">Prop: {n}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <Textarea
                      readOnly
                      className="h-64"
                      value={formatConsultantReport(dateDisplay, myName || "Consultant", consultantMetrics || computeMetrics([]), consultantAutoRating, notes)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => copyToClipboard(formatConsultantReport(dateDisplay, myName || "Consultant", consultantMetrics || computeMetrics([]), consultantAutoRating, notes))}
                      >
                        <Clipboard className="h-4 w-4" /> Copy
                      </Button>
                      <Button
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => sendViaWhatsApp(formatConsultantReport(dateDisplay, myName || "Consultant", consultantMetrics || computeMetrics([]), consultantAutoRating, notes))}
                      >
                        <MessageCircle className="h-4 w-4" /> Send via WhatsApp
                      </Button>
                    </div>
                  </>
                )}

                {mode === "admin" && (
                  <TooltipProvider>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {adminEntries.map((e, idx) => (
                        <div key={e.name} className="flex flex-wrap items-center justify-between border rounded-md p-2 bg-white md:bg-gradient-to-r md:from-white md:to-indigo-50">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium">{idx + 1}.</span>
                            <span className="truncate max-w-[10rem] sm:max-w-[16rem]">{e.name}</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <Badge className="bg-slate-100 text-slate-800 border-slate-200">Leads: {e.metrics.total}</Badge>
                            <Badge className="bg-green-100 text-green-800 border-green-200">Booked: {e.metrics.booked}</Badge>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-orange-100 text-orange-800 border-orange-200 cursor-help">Hot: {e.metrics.hot}</Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[18rem] whitespace-pre-wrap">
                                {e.metrics.highlights.hotNames.length ? e.metrics.highlights.hotNames.join(", ") : "No hot leads"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 cursor-help">Prop: {e.metrics.proposals}</Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[18rem] whitespace-pre-wrap">
                                {e.metrics.highlights.proposalNames.length ? e.metrics.highlights.proposalNames.join(", ") : "No proposals"}
                              </TooltipContent>
                            </Tooltip>
                            <Badge className="bg-violet-100 text-violet-800 border-violet-200">FU: {e.metrics.followUps}</Badge>
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">WA: {e.metrics.whatsapp}</Badge>
                            <div className="flex items-center gap-1">
                              <Award className="h-3 w-3 text-amber-500" />
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200">{e.rating}</Badge>
                            </div>
                            <div className="ml-auto text-[11px] text-muted-foreground">Score: {e.score}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Textarea
                      readOnly
                      className="h-64"
                      value={formatTeamReport(
                        dateDisplay,
                        adminEntries,
                        notes
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => copyToClipboard(formatTeamReport(dateDisplay, adminEntries, notes))}
                      >
                        <Clipboard className="h-4 w-4" /> Copy Combined
                      </Button>
                      <Button
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => sendViaWhatsApp(formatTeamReport(dateDisplay, adminEntries, notes))}
                      >
                        <MessageCircle className="h-4 w-4" /> Send via WhatsApp
                      </Button>
                    </div>
                  </TooltipProvider>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function Stat({ label, value, color = "slate" }: { label: string; value: number; color?: "slate" | "blue" | "violet" | "indigo" | "emerald" | "orange" | "green" | "rose" }) {
  return (
    <div className={
      [
        "flex items-center justify-between rounded-md px-3 py-2 border",
        color === "blue" && "bg-blue-50 border-blue-200",
        color === "violet" && "bg-violet-50 border-violet-200",
        color === "indigo" && "bg-indigo-50 border-indigo-200",
        color === "emerald" && "bg-emerald-50 border-emerald-200",
        color === "orange" && "bg-orange-50 border-orange-200",
        color === "green" && "bg-green-50 border-green-200",
        color === "rose" && "bg-rose-50 border-rose-200",
        color === "slate" && "bg-slate-50 border-slate-200",
      ].filter(Boolean).join(" ")
    }>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default DailyReportDialog;
