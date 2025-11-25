import type { SheetLead } from "@/lib/googleSheets";

export interface LeadDiff {
  newLeads: SheetLead[];
  assignedToCurrentUser: SheetLead[];
  bookedLeads: SheetLead[];
}

/**
 * Compares two arrays of leads and identifies the differences.
 * @param oldLeads The array of leads before the data refresh.
 * @param newLeads The array of leads after the data refresh.
 * @param currentUserEmail The email of the current user to check for assignments.
 * @returns An object containing arrays of new, assigned, and booked leads.
 */
export function diffLeads(
  oldLeads: SheetLead[],
  newLeads: SheetLead[],
  currentUserEmail: string
): LeadDiff {
  const oldLeadMap = new Map<string, SheetLead>();
  for (const lead of oldLeads) {
    // A unique identifier for a lead could be a combination of name and creation time, or a dedicated ID if available.
    // Here, we'll use dateAndTime + travellerName as a pseudo-unique key.
    const key = `${lead.dateAndTime}-${lead.travellerName}`;
    oldLeadMap.set(key, lead);
  }

  const diff: LeadDiff = {
    newLeads: [],
    assignedToCurrentUser: [],
    bookedLeads: [],
  };

  for (const newLead of newLeads) {
    const key = `${newLead.dateAndTime}-${newLead.travellerName}`;
    const oldLead = oldLeadMap.get(key);

    if (!oldLead) {
      // This is a completely new lead.
      diff.newLeads.push(newLead);
    } else {
      // The lead existed before, let's check for changes.

      // 1. Check for new assignment to the current user.
      const oldConsultant = oldLead.consultant?.trim().toLowerCase();
      const newConsultant = newLead.consultant?.trim().toLowerCase();
      if (
        newConsultant === currentUserEmail.trim().toLowerCase() &&
        oldConsultant !== newConsultant
      ) {
        diff.assignedToCurrentUser.push(newLead);
      }

      // 2. Check if the status just changed to "Booked".
      const oldStatus = oldLead.status?.trim().toLowerCase();
      const newStatus = newLead.status?.trim().toLowerCase();
      if (
        newStatus?.includes('booked') &&
        !oldStatus?.includes('booked')
      ) {
        diff.bookedLeads.push(newLead);
      }
    }
  }

  return diff;
}
