import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { SheetLead } from "@/lib/googleSheets";
import { authService } from "@/lib/authService";
import { isBookedStatus, isCancelCategoryStatus, isNewCategoryStatus, normalizeStatus } from "@/lib/leadStatus";
import { Calendar, Clipboard, MessageCircle, Users, Award, RefreshCw } from "lucide-react";

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

function toISODate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseFlexibleDate(input: string): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  // mm/dd/yyyy or mm/dd/yy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const mm = Number(m1[1]);
    const dd = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd-Month-yy or dd-Month-yyyy (e.g., 03-April-25)
  const m2 = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/);
  if (m2) {
    const dd = Number(m2[1]);
    const monthName = m2[2];
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
    if (isNaN(monthIndex)) return null;
    const d = new Date(yy, monthIndex, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  // ISO yyyy-mm-dd
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

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
    lines.push(`${idx + 1}. ${e.name} — Score ${e.score}, Booked ${e.metrics.booked}, Hot ${e.metrics.hot}, Proposals ${e.metrics.proposals}, Follow-ups ${e.metrics.followUps}, New ${e.metrics.new}, WA ${e.metrics.whatsapp}, Cancel ${e.metrics.cancel}, Rating ${e.rating}/10`);
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

  const [selectedDate, setSelectedDate] = useState<string>(() => toISODate(new Date()));
  const [notes, setNotes] = useState<string>("");
  const [rating, setRating] = useState<number>(8);
  const [selectionMode, setSelectionMode] = useState<"me" | "full" | "custom">("me");
  const [selectedConsultants, setSelectedConsultants] = useState<Record<string, boolean>>({});
  const [adminRatings, setAdminRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (mode === "admin") {
      const initial: Record<string, boolean> = {};
      const initialRatings: Record<string, number> = {};
      consultants.forEach((c) => {
        initial[c] = true;
        initialRatings[c] = 8;
      });
      setSelectedConsultants(initial);
      setAdminRatings(initialRatings);
    }
  }, [mode, consultants]);

  const selectedDay = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);

  const leadsForDay = useMemo(() => {
    return leads.filter((l) => sameDay(parseFlexibleDate(l.dateAndTime), selectedDay));
  }, [leads, selectedDay]);

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
      const r = adminRatings[name] ?? 8;
      return { name, metrics: m, rating: r, score };
    });

    entries.sort((a, b) => (b.score - a.score) || (b.metrics.booked - a.metrics.booked));
    return entries;
  }, [mode, selectionMode, consultants, selectedConsultants, consultantNamesForDay, leadsForDay, myName, adminRatings]);

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
    const d = selectedDay;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }, [selectedDay]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "consultant" ? <Users className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            {mode === "consultant" ? "Daily Report (My Activities)" : "Daily Report (Team Builder)"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Date</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-9"
                  />
                  <Button variant="outline" size="icon" onClick={() => setSelectedDate(toISODate(new Date()))}>
                    <Calendar className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {mode === "consultant" && (
                <div className="space-y-2">
                  <Label className="text-xs">My Rating (/10)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={rating}
                    onChange={(e) => setRating(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                  />
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

          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mode === "consultant" && (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <Stat label="New" value={consultantMetrics?.new || 0} />
                      <Stat label="Follow-ups" value={consultantMetrics?.followUps || 0} />
                      <Stat label="Proposals" value={consultantMetrics?.proposals || 0} />
                      <Stat label="WhatsApp" value={consultantMetrics?.whatsapp || 0} />
                      <Stat label="Hot" value={consultantMetrics?.hot || 0} />
                      <Stat label="Booked" value={consultantMetrics?.booked || 0} />
                      <Stat label="Cancel" value={consultantMetrics?.cancel || 0} />
                    </div>
                    <Textarea
                      readOnly
                      className="h-64"
                      value={formatConsultantReport(dateDisplay, myName || "Consultant", consultantMetrics || computeMetrics([]), rating, notes)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => copyToClipboard(formatConsultantReport(dateDisplay, myName || "Consultant", consultantMetrics || computeMetrics([]), rating, notes))}
                      >
                        <Clipboard className="h-4 w-4" /> Copy
                      </Button>
                      <Button
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => sendViaWhatsApp(formatConsultantReport(dateDisplay, myName || "Consultant", consultantMetrics || computeMetrics([]), rating, notes))}
                      >
                        <MessageCircle className="h-4 w-4" /> Send via WhatsApp
                      </Button>
                    </div>
                  </>
                )}

                {mode === "admin" && (
                  <>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {adminEntries.map((e, idx) => (
                        <div key={e.name} className="flex items-center justify-between border rounded-md p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{idx + 1}.</span>
                            <span>{e.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span>Score: {e.score}</span>
                            <span>Booked: {e.metrics.booked}</span>
                            <span>Hot: {e.metrics.hot}</span>
                            <span>Prop: {e.metrics.proposals}</span>
                            <span>FU: {e.metrics.followUps}</span>
                            <div className="flex items-center gap-1">
                              <Award className="h-3 w-3" />
                              <Input
                                type="number"
                                min={0}
                                max={10}
                                value={adminRatings[e.name] ?? 8}
                                onChange={(ev) => {
                                  const v = Math.max(0, Math.min(10, Number(ev.target.value) || 0));
                                  setAdminRatings((prev) => ({ ...prev, [e.name]: v }));
                                }}
                                className="h-7 w-16"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Textarea
                      readOnly
                      className="h-64"
                      value={formatTeamReport(
                        dateDisplay,
                        adminEntries.map((e) => ({ ...e, rating: adminRatings[e.name] ?? e.rating })),
                        notes
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => copyToClipboard(formatTeamReport(dateDisplay, adminEntries.map((e) => ({ ...e, rating: adminRatings[e.name] ?? e.rating })), notes))}
                      >
                        <Clipboard className="h-4 w-4" /> Copy Combined
                      </Button>
                      <Button
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => sendViaWhatsApp(formatTeamReport(dateDisplay, adminEntries.map((e) => ({ ...e, rating: adminRatings[e.name] ?? e.rating })), notes))}
                      >
                        <MessageCircle className="h-4 w-4" /> Send via WhatsApp
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border rounded-md px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default DailyReportDialog;
