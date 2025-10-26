import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

// Format: 25/12/2025 ➔ 25 December 2025
function prettyDateDisplay(dateStr: string) {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dateStr;
  const day = m[1].padStart(2, "0");
  const month = Number(m[2]);
  const year = m[3];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  if (month < 1 || month > 12) return dateStr;
  return `${day} ${months[month-1]} ${year}`;
}

// Only dd/mm/yyyy allowed, never 25-December-2025 or 25-12-25 for input (validation will fail otherwise).
function isValidDateFormat(dateStr: string): boolean {
  const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(regex);
  if (!match) return false;
  const dd = Number(match[1]), mm = Number(match[2]), yyyy = Number(match[3]);
  if (dd<1||dd>31||mm<1||mm>12||yyyy<1900||yyyy>2100) return false;
  return true;
}
// dd/mm/yyyy to mm/dd/yyyy
function convertToSheetDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dateStr;
  const dd = m[1]; const mm = m[2]; const yyyy = m[3];
  return `${mm}/${dd}/${yyyy}`;
}
// mm/dd/yyyy or dd/mm/yyyy to dd/mm/yyyy (display)
function convertToDisplayDate(val: string): string {
  if (!val) return "";
  // mm/dd/yyyy
  const m1 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m1) return val;
  const mm = m1[1].padStart(2,"0"); const dd = m1[2].padStart(2,"0");
  let yyyy = m1[3];
  if (yyyy.length===2) yyyy = "20"+yyyy;
  return `${dd}/${mm}/${yyyy}`;
}
// Remove control characters from textboxes (to avoid JSON errors!)
function sanitizeText(str: string = "") {
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g,"");
}

const LeadDetailsDialog = ({ lead, open, onClose, onUpdate }: LeadDetailsDialogProps) => {
  const [formData, setFormData] = useState<SheetLead>({
    ...lead,
    travelDate: convertToDisplayDate(lead.travelDate),
  });
  const [saving, setSaving] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [dateError, setDateError] = useState<string>("");
  const { toast } = useToast();

  // User input handler for date
  const handleDateChange = (value: string) => {
    setFormData({ ...formData, travelDate: value });
    if (value && !isValidDateFormat(value)) {
      setDateError("Use dd/mm/yyyy format (e.g., 25/10/2025)");
    } else {
      setDateError("");
    }
  };

  const handleSave = async () => {
    if (formData.travelDate && !isValidDateFormat(formData.travelDate)) {
      toast({ variant: "destructive", title: "Invalid date format", description: "Please use dd/mm/yyyy format (e.g., 25/10/2025)", duration: 3000 });
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
        travelDate: convertToSheetDate(formData.travelDate),
        remarks: sanitizeText(formData.remarks),
        notes: sanitizeText(formData.notes)
        // Add any other fields that should be sanitized
      };

      await sheetsService.updateLead(lead, dataToSave);

      toast({
        title: "✅ Lead updated successfully!",
        description: "Changes have been saved to Google Sheets",
        duration: 3000,
      });

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
          {/* ... other fields ... */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Travel Date <span className="text-xs text-muted-foreground ml-2">(dd/mm/yyyy)</span></Label>
              <Input
                type="text"
                placeholder="DD/MM/YYYY (e.g., 25/10/2025)"
                value={formData.travelDate}
                onChange={e => handleDateChange(e.target.value)}
                className={dateError ? 'border-red-500' : ''}
                autoComplete="off"
              />
              {dateError && <p className="text-xs text-red-500">{dateError}</p>}
              {!dateError && formData.travelDate && (
                <p className="text-xs text-green-600">✓ Valid date format</p>
              )}
            </div>
            <div className="space-y-2 flex flex-col justify-end">
              <Label>Pretty Date (Read-only)</Label>
              <Input value={prettyDateDisplay(formData.travelDate)} readOnly />
            </div>
          </div>
          {/* ...rest of your form... */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !!dateError}>{saving ? "Saving..." : "Save Changes"}</Button>
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
