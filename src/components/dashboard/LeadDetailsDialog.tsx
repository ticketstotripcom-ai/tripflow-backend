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

/**
 * Convert mm/dd/yyyy (Google Sheets) → dd/mm/yyyy (Display)
 */
const convertToDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  const s = String(dateStr).trim();
  
  // Parse mm/dd/yyyy format from Google Sheets
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const mm = String(m1[1]).padStart(2, '0');
    const dd = String(m1[2]).padStart(2, '0');
    let yyyy = m1[3];
    if (yyyy.length === 2) {
      yyyy = '20' + yyyy;
    }
    return `${dd}/${mm}/${yyyy}`; // Return dd/mm/yyyy
  }
  
  // Already in dd/mm/yyyy format
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2 && Number(m2[1]) > 12) {
    // First number > 12, so it's already dd/mm/yyyy
    return s;
  }
  
  return dateStr; // Fallback: return as-is
};

/**
 * Convert dd/mm/yyyy (Display) → mm/dd/yyyy (Google Sheets)
 */
const convertToSheetDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  const s = String(dateStr).trim();
  
  // Parse dd/mm/yyyy format from display
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = m1[1];
    const mm = m1[2];
    const yyyy = m1[3];
    
    // Check if it's likely dd/mm/yyyy (day > 12)
    if (Number(dd) > 12) {
      return `${mm}/${dd}/${yyyy}`; // Convert to mm/dd/yyyy
    }
    
    // Ambiguous case (both < 12), assume it's already dd/mm/yyyy since user entered it
    return `${mm}/${dd}/${yyyy}`;
  }
  
  return dateStr; // Fallback: return as-is
};

/**
 * Validate dd/mm/yyyy format
 */
const isValidDateFormat = (dateStr: string): boolean => {
  if (!dateStr) return true; // Empty is valid
  
  const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(regex);
  
  if (!match) return false;
  
  const dd = Number(match[1]);
  const mm = Number(match[2]);
  const yyyy = Number(match[3]);
  
  // Validate ranges
  if (dd < 1 || dd > 31) return false;
  if (mm < 1 || mm > 12) return false;
  if (yyyy < 1900 || yyyy > 2100) return false;
  
  return true;
};

const LeadDetailsDialog = ({ lead, open, onClose, onUpdate }: LeadDetailsDialogProps) => {
  // Convert travel date from mm/dd/yyyy to dd/mm/yyyy for display
  const [formData, setFormData] = useState<SheetLead>({
    ...lead,
    travelDate: convertToDisplayDate(lead.travelDate),
  });
  
  const [saving, setSaving] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [dateError, setDateError] = useState<string>('');
  const { toast } = useToast();

  const handleDateChange = (value: string) => {
    setFormData({ ...formData, travelDate: value });
    
    // Validate format as user types
    if (value && !isValidDateFormat(value)) {
      setDateError('Use dd/mm/yyyy format (e.g., 25/10/2025)');
    } else {
      setDateError('');
    }
  };

  const handleSave = async () => {
    // Validate date before saving
    if (formData.travelDate && !isValidDateFormat(formData.travelDate)) {
      toast({
        variant: "destructive",
        title: "❌ Invalid date format",
        description: "Please use dd/mm/yyyy format (e.g., 25/10/2025)",
        duration: 3000,
      });
      return;
    }

    try {
      setSaving(true);
      
      const credentials = await secureStorage.getCredentials();
      if (!credentials) {
        throw new Error('Google Sheets credentials not configured. Please check Settings or localSecrets.ts');
      }

      if (!credentials.googleServiceAccountJson) {
        throw new Error('Service Account JSON is required for updating leads. Please configure it in Settings or localSecrets.ts');
      }

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      // Convert travel date from dd/mm/yyyy back to mm/dd/yyyy for Google Sheets
      const dataToSave = {
        ...formData,
        travelDate: convertToSheetDate(formData.travelDate),
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
      toast({
        variant: "destructive",
        title: "❌ Failed to update lead",
        description: error.message || "Unknown error occurred. Check console for details.",
        duration: 5000,
      });
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
          {/* Form elements like Trip ID, Date, Traveller Name, Phone, Email, Status, etc. */}
          {/* Omitted here for brevity, reuse your existing form JSX, bind it to formData */}
          <div className="space-y-2">
            <Label>Travel Date</Label>
            <Input 
              type="text"
              placeholder="DD/MM/YYYY (e.g., 25/10/2025)"
              value={formData.travelDate} 
              onChange={(e) => handleDateChange(e.target.value)}
              className={dateError ? 'border-red-500' : ''}
            />
            {dateError && <p className="text-xs text-red-500">{dateError}</p>}
            {!dateError && formData.travelDate && (<p className="text-xs text-green-600">✓ Valid date format</p>)}
          </div>
          {/* Other inputs like hotel category, remarks, etc. */}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !!dateError}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
      
      {/* Show reminder dialog as before */}
      {showReminderDialog && (
        <ReminderDialog
          open={showReminderDialog}
          onClose={() => setShowReminderDialog(false)}
          leadTripId={lead.tripId}
          leadName={lead.travellerName}
          onReminderSet={(reminder) => {
            console.log('Reminder set:', reminder);
          }}
        />
      )}
    </Dialog>
  );
};

export default LeadDetailsDialog;
