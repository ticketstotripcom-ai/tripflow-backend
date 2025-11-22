import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/services/db";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { createNotifications, NewNotificationInput } from "@/services/notificationService";
import { parseLeadActivityFromRemark } from "@/utils/leadActivityParser";
import { calculateLeadUrgencyScore, LeadForScoring } from "@/utils/leadScoring";
import { getNextBestAction } from "@/utils/nextBestAction";

// Clean, single implementation of CRM data hook with notification triggers
export function useCRMData() {
  const [leads, setLeads] = useState<SheetLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousLeadsRef = useRef<SheetLead[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());
  const usersCacheRef = useRef<{ admins: string[]; consultants: { name: string; email: string }[] } | null>(null);
  const lastActionNotifiedRef = useRef<Map<string, number>>(new Map()); // key -> timestamp ms for dedup

  const dedupeKey = (email: string, leadId: string | undefined, action: string) =>
    `${email}-${leadId || "unknown"}-${action}`;

  const hoursSince = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / 36e5;
  };

  const loadUsers = useCallback(async () => {
    if (usersCacheRef.current) return usersCacheRef.current;
    try {
      const credentials = await secureStorage.getCredentials();
      if (!credentials) return null;
      const localServiceAccountJson = (() => {
        try {
          return localStorage.getItem("serviceAccountJson") || undefined;
        } catch {
          return undefined;
        }
      })();
      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey || "",
        serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "",
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings,
      });
      const users = await sheetsService.fetchUsers();
      const admins = users.filter((u) => u.role === "admin").map((u) => u.email.toLowerCase());
      const consultants = users
        .filter((u) => u.role === "consultant")
        .map((u) => ({ name: (u.name || "").toLowerCase(), email: u.email.toLowerCase() }));
      usersCacheRef.current = { admins, consultants };
      return usersCacheRef.current;
    } catch (err) {
      console.warn("[useCRMData] Failed to load users for notifications", err);
      return null;
    }
  }, []);

  const detectAndNotify = useCallback(
    async (freshLeads: SheetLead[]) => {
      const prev = previousLeadsRef.current || [];
      if (!prev.length) {
        previousLeadsRef.current = freshLeads;
        return;
      }
      const users = await loadUsers();
      if (!users) {
        previousLeadsRef.current = freshLeads;
        return;
      }

      const findPrev = (lead: SheetLead) =>
        prev.find(
          (p) =>
            (p.tripId && p.tripId === lead.tripId) ||
            ((p.travellerName || "").toLowerCase() === (lead.travellerName || "").toLowerCase())
        );

      const newNotifications: NewNotificationInput[] = [];

      freshLeads.forEach((lead) => {
        const keyBase = (lead.tripId || lead.travellerName || "").toString();
        const prevLead = findPrev(lead);
        const activity = parseLeadActivityFromRemark(lead.remarks || "");
        const scoringLead: LeadForScoring = {
          id: lead.tripId || keyBase,
          travellerName: lead.travellerName || "",
          status: lead.status || "",
          remark: lead.remarks || "",
          assignedToEmail: (lead.consultant || "").toLowerCase(),
          activity,
        };
        const score = calculateLeadUrgencyScore(scoringLead);
        const nextAction = getNextBestAction(scoringLead, score);
        const assignedEmail =
          users.consultants.find((c) => c.name === (lead.consultant || "").toLowerCase())?.email ||
          (lead.consultant || "").toLowerCase();

        // Score-based follow-up notifications with dedupe (4-hour window)
        if (assignedEmail && score >= 20) {
          const windowMs = 4 * 60 * 60 * 1000;
          const k = dedupeKey(assignedEmail, lead.tripId || lead.travellerName, nextAction.action);
          const last = lastActionNotifiedRef.current.get(k);
          const nowMs = Date.now();
          if (!last || nowMs - last > windowMs) {
            lastActionNotifiedRef.current.set(k, nowMs);
            const priority = score > 70 ? "high" : score >= 40 ? "normal" : "low";
            newNotifications.push({
              sourceSheet: "Master Data",
              title:
                score > 70
                  ? "Follow Up Now: High Priority Lead"
                  : score >= 40
                  ? "Reminder: Follow Up Lead"
                  : "Reminder: Nurture Lead",
              message: nextAction.reason,
              roleTarget: "consultant",
              userEmail: assignedEmail,
              route: lead.tripId ? `/lead/${lead.tripId}` : "/dashboard",
              targetTravellerName: lead.travellerName,
              targetTripId: lead.tripId,
              targetDateTime: lead.dateAndTime,
              notificationType: "FOLLOWUP",
              priority,
              nextAction: nextAction.action,
              internalId: `${assignedEmail}-${lead.tripId || lead.travellerName}-${nextAction.action}`,
            });
          }
        }

        // Time-based nudges layered on top of scoring
        if (assignedEmail) {
          const hCall = hoursSince(activity.lastCallAt);
          const hWA = hoursSince(activity.lastWhatsappAt);
          const hStatus = hoursSince(activity.lastStatusChangeAt);
          const statusLower = (lead.status || "").toLowerCase();

          const pushNotification = (
            title: string,
            message: string,
            action: string,
            priority: "high" | "normal" | "low" = "normal"
          ) => {
            const k = dedupeKey(assignedEmail, lead.tripId || lead.travellerName, action);
            const last = lastActionNotifiedRef.current.get(k);
            const nowMs = Date.now();
            if (last && nowMs - last < 4 * 60 * 60 * 1000) return;
            lastActionNotifiedRef.current.set(k, nowMs);
            newNotifications.push({
              sourceSheet: "Master Data",
              title,
              message,
              roleTarget: "consultant",
              userEmail: assignedEmail,
              route: lead.tripId ? `/lead/${lead.tripId}` : "/dashboard",
              targetTravellerName: lead.travellerName,
              targetTripId: lead.tripId,
              targetDateTime: lead.dateAndTime,
              notificationType: "FOLLOWUP",
              priority,
              nextAction: action,
              internalId: `${assignedEmail}-${lead.tripId || lead.travellerName}-${action}`,
            });
          };

          if (statusLower === "hot leads" && (hCall === null || hCall > 6)) {
            pushNotification("Follow Up Now: Hot Lead Cooling Down", "Last call was over 6 hours ago for a hot lead. Call now.", "CALL_NOW", "high");
          }

          if (statusLower === "negotiations" && hStatus !== null && hStatus > 8) {
            pushNotification("Negotiation Stuck – Take Action", "No status change in negotiations for 8+ hours. Push forward.", "PUSH_NEGOTIATION", "high");
          }

          if (statusLower.startsWith("proposal")) {
            if (hWA !== null && hWA > 48) {
              pushNotification("Final Proposal Reminder", "No reply 48+ hours after proposal. Try a call.", "CALL_NOW", "high");
            } else if (hWA !== null && hWA > 24) {
              pushNotification("Proposal Follow-Up Needed", "Proposal shared 24+ hours ago. Send a second reminder.", "SEND_WHATSAPP", "normal");
            } else if (hWA !== null && hWA > 12) {
              pushNotification("Proposal Follow-Up Needed", "Proposal shared 12+ hours ago. Send a WhatsApp reminder.", "SEND_WHATSAPP", "high");
            }
          }

          if (statusLower.startsWith("follow-up calls") && (hCall === null || hCall > 24)) {
            pushNotification("Reminder: Call Lead Again", "Follow-up pending. Last call was over 24 hours ago.", "CALL_NOW", score >= 70 ? "high" : "normal");
          }

          if (statusLower === "whatsapp sent" && (hWA === null || hWA > 18) && (hCall === null || hCall > 18)) {
            pushNotification("WhatsApp Reminder Needed", "WhatsApp sent 18+ hours ago with no call. Follow up now.", "SEND_WHATSAPP", "normal");
          }

          if (statusLower === "unfollowed" && (hCall === null || hCall > 2)) {
            pushNotification("Call the new lead", "Lead is unassigned/unfollowed and has no call in the last 2 hours.", "CALL_NOW", "high");
          }
        }

        // A) New lead arrival (unassigned/unstaged)
        if (!prevLead) {
          const ready =
            lead.travellerName &&
            lead.phone &&
            lead.email &&
            !(lead.consultant && lead.consultant.trim()) &&
            !(lead.status && lead.status.trim());
          if (ready) {
            users.admins.forEach((email) => {
              const key = `new-${email}-${keyBase}`;
              if (notifiedRef.current.has(key)) return;
              notifiedRef.current.add(key);
              newNotifications.push({
                sourceSheet: "Leads",
                title: "New Lead Arrived",
                message: `A new lead has arrived: ${lead.travellerName}, ${lead.phone}, ${lead.email}. Please assign it.`,
                roleTarget: "admin",
                userEmail: email,
                route: lead.tripId ? `/lead/${lead.tripId}` : "/dashboard",
                targetTravellerName: lead.travellerName,
                targetTripId: lead.tripId,
                targetDateTime: lead.dateAndTime,
                type: "heads-up",
                priority: "high",
              });
            });
          }
          return;
        }

        const statusNow = (lead.status || "").toLowerCase();
        const statusPrev = (prevLead.status || "").toLowerCase();
        const consultantNow = (lead.consultant || "").trim();
        const consultantPrev = (prevLead.consultant || "").trim();

        // B) Assignment to consultant in Unfollow/Unfollowed
        const isUnfollow = statusNow === "unfollow" || statusNow === "unfollowed";
        if (!consultantPrev && consultantNow && isUnfollow) {
          const consultantEmail =
            users.consultants.find((c) => c.name === consultantNow.toLowerCase())?.email ||
            consultantNow.toLowerCase();
          const key = `assign-${consultantEmail}-${keyBase}`;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            newNotifications.push({
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
          }
        }

        // C) Booked with us
        const bookedNow = statusNow === "booked with us";
        const bookedPrev = statusPrev === "booked with us";
        if (bookedNow && !bookedPrev) {
          const consultantEmail =
            users.consultants.find((c) => c.name === consultantNow.toLowerCase())?.email ||
            consultantNow.toLowerCase();
          const keyConsultant = `booked-self-${consultantEmail}-${keyBase}`;
          if (consultantEmail && !notifiedRef.current.has(keyConsultant)) {
            notifiedRef.current.add(keyConsultant);
            newNotifications.push({
              sourceSheet: "Leads",
              title: "Congratulations! Lead Booked With Us",
              message: `Great job! You closed ${lead.travellerName} for trip ${lead.tripId}.`,
              roleTarget: "consultant",
              userEmail: consultantEmail,
              route: lead.tripId ? `/lead/${lead.tripId}` : "/dashboard",
              targetTravellerName: lead.travellerName,
              targetTripId: lead.tripId,
              targetDateTime: lead.dateAndTime,
              type: "push",
              priority: "high",
            });
          }

          const teamEmails = Array.from(new Set([...users.admins, ...users.consultants.map((c) => c.email)]));
          teamEmails.forEach((email) => {
            const key = `booked-team-${email}-${keyBase}`;
            if (notifiedRef.current.has(key)) return;
            notifiedRef.current.add(key);
            newNotifications.push({
              sourceSheet: "Leads",
              title: "Team Update: Lead Booked",
              message: `${consultantNow || "A consultant"} has successfully booked ${lead.travellerName} (Trip ${lead.tripId}) with us.`,
              roleTarget: "team",
              userEmail: email,
              route: lead.tripId ? `/lead/${lead.tripId}` : "/dashboard",
              targetTravellerName: lead.travellerName,
              targetTripId: lead.tripId,
              targetDateTime: lead.dateAndTime,
              type: "push",
              priority: "high",
            });
          });
        }
      });

      if (newNotifications.length) {
        try {
          await createNotifications(newNotifications);
        } catch (err) {
          console.warn("[useCRMData] Failed to create notifications", err);
        }
      }

      previousLeadsRef.current = freshLeads;
    },
    [loadUsers]
  );

  const syncData = useCallback(
    async (showLoading = false) => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        // 1) Load cached leads from Dexie first for instant UI
        const dexieLeads = await db.leads.toArray();
        if (dexieLeads.length > 0) {
          console.log("[useCRMData] Loaded leads from Dexie:", dexieLeads.length);
          setLeads(dexieLeads);
        }

        // 2) Fetch fresh leads from Google Sheets and update cache
        const credentials = await secureStorage.getCredentials();
        if (!credentials) throw new Error("Google Sheets credentials not configured");
        const localServiceAccountJson = (() => {
          try {
            return localStorage.getItem("serviceAccountJson") || undefined;
          } catch {
            return undefined;
          }
        })();
        const svc = new GoogleSheetsService({
          apiKey: credentials.googleApiKey || "",
          serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
          sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "",
          worksheetNames: credentials.worksheetNames,
          columnMappings: credentials.columnMappings,
        });
        const freshLeads = await svc.fetchLeads(true);
        if (!controller.signal.aborted) {
          await db.leads.clear();
          await db.leads.bulkAdd(freshLeads);
          setLeads(freshLeads);
          setLastSync(new Date());
          console.log("[useCRMData] Synced fresh leads:", freshLeads.length);
          detectAndNotify(freshLeads);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Failed to sync CRM data:", err);
          setError(err instanceof Error ? err.message : "Failed to sync data");
          const cached = await db.leads.toArray();
          if (cached.length > 0) setLeads(cached);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
    },
    [detectAndNotify]
  );

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      await syncData(true);
      if (!mounted) return;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (mounted) syncData(false);
      }, 300000);
    };

    initialize();

    const onFocus = () => {
      if (mounted) syncData(false);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [syncData]);

  return { leads, loading, error, lastSync, syncData };
}
