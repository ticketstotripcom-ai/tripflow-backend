import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { Bell, Clock } from "lucide-react";
import { formatDisplayDate } from "@/lib/dateUtils";
import ReminderDialog from "./ReminderDialog";
import SnoozeOptionsDialog from "../SnoozeOptionsDialog"; // ✅ NEW import
import { useGlobalPopupClose } from "@/hooks/useGlobalPopupClose";
import { notificationSettingsService } from "@/lib/notificationSettings"; // ✅ NEW import

interface LeadDetailsDialogProps {
  lead: SheetLead;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onImmediateUpdate?: (updatedLead: SheetLead) => void;
}

const LEAD_STATUSES = [
  "Unfollowed",
  "Follow-up Calls",
  "Follow-up Calls - 1",
  "Follow-up Calls - 2",
  "Follow-up Calls - 3",
  "Follow-up Calls - 4",
  "Follow-up Calls - 5",
  "Working on it",
  "Whatsapp Sent",
  "Proposal 1 Shared",
  "Proposal 2 Shared",
  "Proposal 3 Shared",
  "Negotiations",
  "Hot Leads",
  "Booked With Us",
  "Cancellations",
  "Postponed",
  "Booked Outside",
  "Pamplets Shared",
];

const HOTEL_CATEGORIES = ["Basic", "3 Star", "3 Star Plus", "4 Star", "5 Star"];
const MEAL_PLANS = [
  "EPAI (No Meal)",
  "CPAI (Only Breakfast)",
  "MAPAI (Breakfast and Dinner)",
  "APAI (Breakfast, Lunch and Dinner)",
  "All Meal with High Tea"
];

// Date utils
function prettyDateDisplay(dateStr: string) {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dateStr;
  const day = m[1].padStart(2, "0");
  const month = Number(m[2]);
  const year = m[3];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  if (month<1||month>12) return dateStr;
  return `${day} ${months[month-1]} ${year}`;
}
function parseAnyDate(str: string): Date | undefined {
  if (!str) return undefined;
  let d: Date | undefined = undefined;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) { // dd/mm/yyyy or mm/dd/yyyy
    const [a, b, c] = str.split("/");
    if (Number(a) > 12) d = new Date(Number(c), Number(b)-1, Number(a));
    else d = new Date(Number(c), Number(a)-1, Number(b));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { // yyyy-mm-dd
    d = new Date(str);
  } else if (/^[0-9]{1,2}-[A-Za-z]+-\d{2,4}$/.test(str)) { // 25-December-2025
    const [dd, Month, yyyy] = str.split("-");
    d = new Date(`${Month} ${dd}, ${yyyy}`);
  } else {
    const jsDate = new Date(str);
    if (!isNaN(jsDate.getTime())) d = jsDate;
  }
  if (d && !isNaN(d.getTime())) return d;
  return undefined;
}
function dateToDDMMYYYY(date: Date | string | undefined): string {
  if (!date) return "";
  const d: Date = date instanceof Date ? date : parseAnyDate(date) || new Date();
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function sanitizeText(str: string = "") {
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g,"");
}

const LeadDetailsDialog = ({ lead, open, onClose, onUpdate, onImmediateUpdate }: LeadDetailsDialogProps) => {
  const [formData, setFormData] = useState<SheetLead>({
    ...lead,
    travelDate: dateToDDMMYYYY(lead.travelDate),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [dateError, setDateError] = useState<string>("");
  const { toast } = useToast();
  const [isSnoozed, setIsSnoozed] = useState(false);

  useGlobalPopupClose(() => {
    if (open) {
      onClose();
    }
  }, open);

  useEffect(() => {
    (async () => {
      try {
        const snoozed = await notificationSettingsService.isLeadSnoozed(lead.tripId);
        setIsSnoozed(!!snoozed);
      } catch {}
    })();
  }, [lead.tripId]);

  const handleDateChange = (rawVal: string) => {
    const normalized = dateToDDMMYYYY(parseAnyDate(rawVal) || rawVal);
    setFormData({ ...formData, travelDate: normalized });
    if (normalized && !/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
      setDateError("Please select or enter a valid date.");
    } else {
      setDateError("");
    }
  };
  const handleCalendarChange = (date: Date | undefined) => {
    if (!date) return;
    const normalized = dateToDDMMYYYY(date);
    setFormData({ ...formData, travelDate: normalized });
    setDateError("");
    setCalendarOpen(false);
  };

  const handleSave = async () => {
    if (!formData.travelDate || !/^\d{2}\/\d{2}\/\d{4}$/.test(formData.travelDate)) {
      setDateError("Please select or enter a valid date (dd/mm/yyyy).");
      toast({ variant: "destructive", title: "❌ Invalid date format", description: "Use or pick dd/mm/yyyy (e.g., 25/10/2025)", duration: 4000 });
      return;
    }
    try {
      setSaving(true);
      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error('Google Sheets credentials not configured.');
      // Fallback to localStorage for service account JSON
      let effectiveServiceAccountJson = credentials.googleServiceAccountJson;
      if (!effectiveServiceAccountJson) {
        try { effectiveServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
      }
      if (!effectiveServiceAccountJson) {
        throw new Error('Service Account JSON missing. Please re-enter in Admin Settings.');
      }
      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: effectiveServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });
      const dataToSave = {
        ...formData,
        // Date normalization handled inside GoogleSheetsService
        remarks: sanitizeText(formData.remarks),
        notes: sanitizeText(formData.notes)
      };
      // Optimistically update UI immediately
      const optimisticLead: SheetLead = {
        ...lead,
        ...formData,
      };
      onImmediateUpdate?.(optimisticLead);
      const wasBooked = (lead.status || '').toLowerCase().includes('booked');
      const nowBooked = (formData.status || '').toLowerCase().includes('booked');
      console.log('✅ Using Service Account for Sheets write operation');
      await sheetsService.updateLead(lead, dataToSave);
      toast({ title: "✅ Lead updated successfully!", description: "Changes have been saved.", duration: 3000 });
      if (!wasBooked && nowBooked) {
        // Fire confetti celebration
        try {
          const mod = await import('canvas-confetti');
          const confetti = mod.default;
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        } catch {}
      }
      // Ask parent to force refresh so the updated lead reflects immediately
      onUpdate();
      onClose();
    } catch (error: any) {
      toast({ variant: "destructive", title: "❌ Failed to update lead", description: error.message || "Unknown error occurred.", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="grid grid-rows-[auto_1fr_auto] max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <DialogTitle>Lead Details - {lead.travellerName}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
          <div className="space-y-4 p-6 pb-20">

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trip ID</Label>
                <Input value={formData.tripId} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input value={formData.dateAndTime} readOnly className="bg-muted" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Traveller Name</Label>
              <Input value={formData.travellerName} readOnly className="bg-muted" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1000]" position="popper">
                  {LEAD_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={(formData.priority || 'medium').toLowerCase()}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1000]" position="popper">
                  <SelectItem value="high">🔴 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🟢 Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Travel Date
                  <span className="text-xs text-muted-foreground ml-2">(dd/mm/yyyy)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="DD/MM/YYYY (e.g., 25/10/2025)"
                    value={formData.travelDate}
                    onChange={e => handleDateChange(e.target.value)}
                    className={dateError ? 'border-red-500' : ''}
                    autoComplete="off"
                    onFocus={() => setCalendarOpen(true)}
                  />
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setCalendarOpen(v => !v)}
                      >
                        📅
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="p-0 z-[1000]">
                      <Calendar
                        mode="single"
                        selected={parseAnyDate(formData.travelDate) || undefined}
                        onSelect={handleCalendarChange}
                        className="rounded-md"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {/* Floating calendar handled by Popover */}
                {dateError && <p className="text-xs text-red-500">{dateError}</p>}
                {!dateError && formData.travelDate && (
                  <p className="text-xs text-green-600">✓ {formatDisplayDate(parseAnyDate(formData.travelDate) as any)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Travel State</Label>
                <Input
                  value={formData.travelState}
                  onChange={(e) => setFormData({ ...formData, travelState: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Nights</Label>
                <Input
                  value={formData.nights}
                  onChange={(e) => setFormData({ ...formData, nights: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Pax</Label>
                <Input
                  value={formData.pax}
                  onChange={(e) => setFormData({ ...formData, pax: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Meal Plan</Label>
                <Select
                  value={formData.mealPlan || ""}
                  onValueChange={value => setFormData({ ...formData, mealPlan: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Meal Plan" />
                  </SelectTrigger>
                  <SelectContent className="z-[1000]" position="popper">
                    {MEAL_PLANS.map((plan) => (
                      <SelectItem key={plan} value={plan}>{plan}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hotel Category</Label>
              <Select
                value={formData.hotelCategory}
                onValueChange={(value) => setFormData({ ...formData, hotelCategory: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1000]" position="popper">
                  {HOTEL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                rows={4}
              />
            </div>

            {formData.notes && (
              <div className="space-y-2">
                <Label>Cell Notes (Column K)</Label>
                <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <p className="text-sm whitespace-pre-wrap">{formData.notes}</p>
                </div>
              </div>
            )}

            {!formData.notes && (
              <div className="space-y-2">
                <Label>Cell Notes (Column K)</Label>
                <div className="border rounded-lg p-3 bg-muted/50 border-dashed">
                  <p className="text-sm text-muted-foreground">No notes found for this lead</p>
                </div>
              </div>
            )}

            {formData.remarkHistory && formData.remarkHistory.length > 0 && (
              <div className="space-y-2">
                <Label>Remark History</Label>
                <div className="border rounded-lg p-3 bg-muted/50 space-y-2 max-h-40 overflow-y-auto">
                  {formData.remarkHistory.map((remark, index) => (
                    <div key={index} className="text-sm text-muted-foreground">
                      • {remark}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4 flex gap-2"> {/* Added flex gap */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReminderDialog(true)}
                className="flex-1 gap-2" // Use flex-1 to distribute space
              >
                <Bell className="h-4 w-4" />
                Set Reminder {isSnoozed && <Clock className="h-4 w-4 text-red-500" />} {/* Show clock if snoozed */}
              </Button>
              <SnoozeOptionsDialog
                leadId={lead.tripId}
                leadName={lead.travellerName}
                onSnoozeComplete={() => setIsSnoozed(true)} // Update local state
              >
                 <Button type="button" variant="outline" className="flex-1 gap-2">
                    <Clock className="h-4 w-4" /> {isSnoozed ? 'Unsnooze' : 'Snooze'}
                 </Button>
              </SnoozeOptionsDialog>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !!dateError}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
      {showReminderDialog && (
      <ReminderDialog
        open={showReminderDialog}
        onClose={() => setShowReminderDialog(false)}
        leadTripId={lead.tripId}
        leadName={lead.travellerName}
        onReminderSet={reminder => { console.log('Reminder set:', reminder); }}
      />
    )}
    </Dialog>
  );
};

export default LeadDetailsDialog;

