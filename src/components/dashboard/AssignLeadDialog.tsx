import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { UserCheck } from "lucide-react";
import { useGlobalPopupClose } from "@/hooks/useGlobalPopupClose";
import { stateManager } from "@/lib/stateManager";
import { db } from "@/services/db";
import { createNotification } from "@/services/notificationService";

interface AssignLeadDialogProps {
  open: boolean;
  onClose: () => void;
  lead: SheetLead;
  consultants: string[];
  onSuccess?: (updatedLead: SheetLead) => void;
}

const AssignLeadDialog = ({ open, onClose, lead, consultants, onSuccess }: AssignLeadDialogProps) => {
  const [selectedConsultant, setSelectedConsultant] = useState<string>(lead.consultant || "");
  const [assigning, setAssigning] = useState(false);
  const { toast } = useToast();

  useGlobalPopupClose(() => {
    if (open) onClose();
  }, open);

  useEffect(() => {
    setSelectedConsultant(lead.consultant || "");
  }, [lead.consultant]);

  const handleAssign = async () => {
    if (!selectedConsultant) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a consultant",
      });
      return;
    }

    if (selectedConsultant === lead.consultant) {
      toast({
        variant: "destructive",
        title: "No Change",
        description: "Lead is already assigned to this consultant",
      });
      return;
    }

    setAssigning(true);
    try {
      const applyLocalPersistence = async (updatedLead: SheetLead) => {
        try {
          // Update cached leads persisted in stateManager for immediate UX
          const { leads: cachedLeads } = stateManager.getCachedLeads();
          if (cachedLeads?.length) {
            const next = cachedLeads.map((l) =>
              (l.tripId === updatedLead.tripId && l.travellerName === updatedLead.travellerName) ||
              (!l.tripId && l.travellerName === updatedLead.travellerName)
                ? { ...l, consultant: updatedLead.consultant }
                : l
            );
            stateManager.setCachedLeads(next);
          }
        } catch (err) {
          console.warn("[AssignLeadDialog] Failed to persist cached leads:", err);
        }

        try {
          // Update offline Dexie cache so list shows new assignment before refetch
          const cached = await db.leads.toArray();
          const match = cached.find(
            (l: any) =>
              (l.tripId && l.tripId === updatedLead.tripId) ||
              (l.travellerName || "").toLowerCase() === (updatedLead.travellerName || "").toLowerCase()
          );
          if (match?.id !== undefined) {
            await db.leads.update(match.id, { ...(match as any), consultant: updatedLead.consultant });
          } else {
            await db.leads.add(updatedLead as any);
          }
        } catch (err) {
          console.warn("[AssignLeadDialog] Failed to persist Dexie cache:", err);
        }
      };

      const credentials = await secureStorage.getCredentials();
      if (!credentials) {
        throw new Error('Google Sheets not configured');
      }

      let effectiveServiceAccountJson = credentials.googleServiceAccountJson;
      if (!effectiveServiceAccountJson) {
        try { effectiveServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
      }
      if (!effectiveServiceAccountJson) throw new Error('Service Account JSON missing');

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: effectiveServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      console.log('✅ Using Service Account for Sheets write operation');
      await sheetsService.updateLead(lead, {
        consultant: selectedConsultant,
      });

      toast({
        title: "Success",
        description: lead.consultant 
          ? `Lead reassigned from ${lead.consultant} to ${selectedConsultant}`
          : `Lead assigned to ${selectedConsultant}`,
      });

      const updatedLead: SheetLead = { ...lead, consultant: selectedConsultant };
      const consultantEmail = selectedConsultant.toLowerCase();
      try {
        await createNotification({
          sourceSheet: "Leads",
          title: "New Lead Assigned",
          message: `You have been assigned a new lead: ${lead.travellerName}.`,
          roleTarget: "consultant",
          userEmail: consultantEmail,
          route: lead.tripId ? `/lead/${lead.tripId}` : "/dashboard",
          targetTravellerName: lead.travellerName,
          targetTripId: lead.tripId,
          targetDateTime: lead.dateAndTime,
          type: "heads-up",
          priority: "high",
        });
      } catch (err) {
        console.warn("[AssignLeadDialog] Failed to create assignment notification", err);
      }
      await applyLocalPersistence(updatedLead);

      // Ensure dashboard reloads and dialog closes after optimistic local update
      onSuccess?.(updatedLead);
      onClose();
    } catch (error: any) {
      console.error('Error assigning lead:', error);
      toast({
        variant: "destructive",
        title: "Error assigning lead",
        description: error.message,
      });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            {lead.consultant ? 'Reassign Lead' : 'Assign Lead'}
          </DialogTitle>
          <DialogDescription>
            {lead.consultant 
              ? `Reassign ${lead.travellerName}'s lead to a different consultant`
              : `Assign ${lead.travellerName}'s lead to a consultant`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Lead Details</label>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Trip ID:</strong> {lead.tripId}</p>
              <p><strong>Traveller:</strong> {lead.travellerName}</p>
              <p><strong>Status:</strong> {lead.status}</p>
              {lead.consultant && (
                <p><strong>Current Consultant:</strong> {lead.consultant}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {lead.consultant ? 'New Consultant' : 'Select Consultant'}
            </label>
            <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a consultant" />
              </SelectTrigger>
              <SelectContent>
                {consultants.map((consultant) => (
                  <SelectItem key={consultant} value={consultant}>
                    {consultant}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={assigning}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={assigning}>
            {assigning ? "Assigning..." : lead.consultant ? "Reassign" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignLeadDialog;
