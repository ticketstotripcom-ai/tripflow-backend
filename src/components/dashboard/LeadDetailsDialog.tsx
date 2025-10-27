import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { Bell } from "lucide-react";
import ReminderDialog from "./ReminderDialog";

interface LeadDetailsDialogProps {
  lead: SheetLead;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
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

// Format "25/12/2025" to "25 December 2025"
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
// Returns Date object from any recognizable format, or undefined
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
// Always output dd/mm/yyyy
function dateToDDMMYYYY(date: Date | string | undefined): string {
  if (!date) return "";
  let d: Date = date instanceof Date ? date : parseAnyDate(date) || new Date();
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function sanitizeText(str: string = "") {
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g,"");
}

const LeadDetailsDialog = ({ lead, open, onClose, onUpdate }: LeadDetailsDialogProps) => {
  // Always keep travelDate as string dd/mm/yyyy
  const [formData, setFormData] = useState<SheetLead>({
    ...lead,
    travelDate: dateToDDMMYYYY(lead.travelDate),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [dateError, setDateError] = useState<string>("");
  const { toast } = useToast();

  // Handle date from input and also auto-correct
  const handleDateChange = (rawVal: string) => {
    const normalized = dateToDDMMYYYY(parseAnyDate(rawVal) || rawVal);
    setFormData({ ...formData, travelDate: normalized });
    if (normalized && !/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
      setDateError("Please select or enter a valid date.");
    } else {
      setDateError("");
    }
  };

  // Handle calendar selection
  const handleCalendarChange = (date: Date | undefined) => {
    if (!date) return;
    const normalized = dateToDDMMYYYY(date);
    setFormData({ ...formData, travelDate: normalized });
    setDateError("");
    setCalendarOpen(false);
  };

  const handleSave = async () => {
    // Ensure travelDate is dd/mm/yyyy
    if (!formData.travelDate || !/^\d{2}\/\d{2}\/\d{4}$/.test(formData.travelDate)) {
      setDateError("Please select or enter a valid date (dd/mm/yyyy).");
      toast({ variant: "destructive", title: "❌ Invalid date format", description: "Please use or pick dd/mm/yyyy format (e.g., 25/10/2025)", duration: 4000 });
      return;
    }
    try {
      setSaving(true);
      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error('Google Sheets credentials not configured.');
      if (!credentials.googleServiceAccountJson) throw new Error('Service Account JSON is required.');
      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });
      const dataToSave = {
        ...formData,
        travelDate: `${formData.travelDate.split("/")[1]}/${formData.travelDate.split("/")[0]}/${formData.travelDate.split("/")[2]}`, // mm/dd/yyyy
        remarks: sanitizeText(formData.remarks),
        notes: sanitizeText(formData.notes)
      };
      await sheetsService.updateLead(lead, dataToSave);
      toast({ title: "✅ Lead updated successfully!", description: "Changes have been saved to Google Sheets", duration: 3000 });
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead Details - {lead.travellerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* Existing fields... */}
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
                  onChange={(e) => handleDateChange(e.target.value)}
                  className={dateError ? 'border-red-500' : ''}
                  autoComplete="off"
                  onFocus={() => setCalendarOpen(true)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCalendarOpen(v => !v)}
                >
                  📅
                </Button>
              </div>
              {calendarOpen && (
                <Calendar
                  mode="single"
                  selected={parseAnyDate(formData.travelDate) || undefined}
                  onSelect={handleCalendarChange}
                  className="mt-2"
                  onClickOutside={() => setCalendarOpen(false)}
                />
              )}
              {dateError && <p className="text-xs text-red-500">{dateError}</p>}
              {!dateError && formData.travelDate && (
                <p className="text-xs text-green-600">✓ {prettyDateDisplay(formData.travelDate)}</p>
              )}
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
                <SelectContent>
                  {MEAL_PLANS.map((plan) => (
                    <SelectItem key={plan} value={plan}>{plan}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ...rest of your form fields exactly as before... */}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !!dateError}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
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
