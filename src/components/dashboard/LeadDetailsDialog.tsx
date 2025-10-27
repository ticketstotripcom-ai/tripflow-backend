import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { useState, useEffect } from "react"; // 👈 IMPORT useEffect
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { Bell } from "lucide-react";
import ReminderDialog from "./ReminderDialog";

interface LeadDetailsDialogProps {
  lead: SheetLead;
  open: boolean;
  onClose: () => void;
  onUpdate: (updatedLead: SheetLead) => void; // 👈 CHANGED: Now passes the updated lead
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
  if (/^\d{1,2}\/\d{1,2}\/(\d{2,4})$/.test(str)) { // dd/mm/yyyy or mm/dd/yyyy
    const parts = str.split("/");
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    // Ambiguous: Assume dd/mm/yyyy first if day > 12
    if (Number(parts[0]) > 12) { // dd/mm/yyyy
      d = new Date(Number(year), Number(parts[1])-1, Number(parts[0]));
    } else { // Assume mm/dd/yyyy or dd/mm/yyyy (defaulting to mm/dd for US-centric JS)
      // Let's favor dd/mm/yyyy as per your app's format
      d = new Date(Number(year), Number(parts[1])-1, Number(parts[0]));
    }
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
  let d: Date = date instanceof Date ? date : parseAnyDate(date) || new Date(0); // Use epoch on fail
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
  const [formData, setFormData] = useState<SheetLead>({
    ...lead,
    travelDate: dateToDDMMYYYY(lead.travelDate),
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [dateError, setDateError] = useState<string>("");
  const { toast } = useToast();

  // 👈 ADDED: This effect syncs the form data when the lead prop changes
  useEffect(() => {
    if (open) { // Only reset when the dialog is opening/visible
      setFormData({
        ...lead,
        travelDate: dateToDDMMYYYY(lead.travelDate),
      });
      setDateError(""); // Reset any validation errors
      setCalendarOpen(false); // Close the calendar
    }
  }, [lead, open]); // Re-run this logic if the 'lead' or 'open' prop changes

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
        travelDate: `${formData.travelDate.split("/")[1]}/${formData.travelDate.split("/")[0]}/${formData.travelDate.split("/")[2]}`, // mm/dd/yyyy for Sheets
        remarks: sanitizeText(formData.remarks),
        notes: sanitizeText(formData.notes)
      };
      await sheetsService.updateLead(lead, dataToSave);
      toast({ title: "✅ Lead updated successfully!", description: "Changes have been saved.", duration: 3000 });
      
      // 👈 CHANGED: Pass the updated form data back to the parent
      onUpdate(formData); 
    s   onClose();
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Trip ID</Label>
              <Input value={formData.tripId} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input value={formData.dateAndTime} readOnly className="bg-muted" />
NOT       </div>
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
              <SelectContent>
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
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
      _           <Calendar
                  mode="single"
                  selected={parseAnyDate(formData.travelDate) || undefined}
                  onSelect={handleCalendarChange}
                  className="mt-2"
                  onClickOutside={() => setCalendarOpen(false)}
                />
              )}
              {dateError && <p className="text-xs text-red-500">{dateError}</p>}
              {!dateError && formData.travelDate && /^\d{2}\/\d{2}\/\d{4}$/.test(formData.travelDate) && (
                <p className="text-xs text-green-600">✓ {prettyDateDisplay(formData.travelDate)}</p>
              )}
        _   </div>
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
                value={formData.nights}s  
                onChange={(e) => setFormData({ ...formData, nights: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Pax</Label>
              <Input 
                value={formData.pax}s  
                onChange={(e) => setFormData({ ...formData, pax: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Meal Plan</Label>
              <Select
                value={formData.mealPlan || ""}
s               onValueChange={value => setFormData({ ...formData, mealPlan: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Meal Plan" />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_PLANS.map((plan) => (
s                   <SelectItem key={plan} value={plan}>{plan}</SelectItem>
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
  s           </SelectTrigger>
              <SelectContent>
                {HOTEL_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
    s             </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea 
              value={formData.remarks}s  
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={4}
            />
          </div>

          {formData.notes && (
            <div className="space-y-2">
s             <Label>Cell Notes (Column K)</Label>
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
    </div>

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
s           </div>
          )}

          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowReminderDialog(true)}
              className="w-full gap-2"
            >
              <Bell className="h-4 w-4" />
              Set Reminder for this Lead
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
i           <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
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
