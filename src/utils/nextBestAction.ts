import { LeadForScoring } from "./leadScoring";
import { LeadActivity } from "./leadActivityParser";

export type UrgencyLevel = "low" | "normal" | "high";

export interface NextBestAction {
  action: string;
  label: string;
  urgency: UrgencyLevel;
  reason: string;
  priority?: "low" | "normal" | "high";
}

function hoursSince(iso?: string, now: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 36e5;
}

function callNow(reason: string, urgency: UrgencyLevel = "high"): NextBestAction {
  return { action: "CALL_NOW", label: "Call the lead now", urgency, reason, priority: urgency === "high" ? "high" : "normal" };
}

function sendWhats(reason: string, urgency: UrgencyLevel = "normal"): NextBestAction {
  return { action: "SEND_WHATSAPP", label: "Send a WhatsApp follow-up", urgency, reason, priority: urgency === "high" ? "high" : "normal" };
}

function sendEmail(reason: string, urgency: UrgencyLevel = "normal"): NextBestAction {
  return { action: "SEND_EMAIL", label: "Send an email follow-up", urgency, reason, priority: urgency === "high" ? "high" : "normal" };
}

export function getNextBestAction(lead: LeadForScoring, score: number, now: Date = new Date()): NextBestAction {
  const a: LeadActivity = lead.activity || {};
  const status = (lead.status || "").toLowerCase();
  const hCall = hoursSince(a.lastCallAt, now);
  const hWA = hoursSince(a.lastWhatsappAt, now);
  const hEmail = hoursSince(a.lastEmailAt, now);
  const hStatus = hoursSince(a.lastStatusChangeAt, now);

  // High-impact statuses
  if (status === "hot leads") {
    if (!hCall || hCall > 6) return callNow("Last call > 6h and status is 'Hot Leads'.", "high");
    if (!hWA || hWA > 12) return sendWhats("WhatsApp follow-up pending for hot lead.", "normal");
  }

  if (status === "negotiations") {
    if (hStatus !== null && hStatus > 8) return { action: "PUSH_NEGOTIATION", label: "Push negotiation forward", urgency: "high", reason: "No status change in >8h while in negotiations." };
    if (hEmail !== null && hEmail > 24) return sendEmail("Email follow-up pending in negotiations >24h.", "normal");
  }

  if (status.startsWith("proposal")) {
    if (!hWA || hWA > 12) return sendWhats("Proposal shared; WhatsApp follow-up after 12h.", "high");
    if (!hEmail || hEmail > 24) return sendEmail("Proposal shared; email reminder after 24h.", "normal");
  }

  // Follow-up statuses
  if (status.startsWith("follow-up calls")) {
    if (!hCall || hCall > 24) return callNow("Follow-up status; last call >24h or none.", score >= 70 ? "high" : "normal");
  }

  if (status === "whatsapp sent") {
    if ((!hWA || hWA > 18) && (!hCall || hCall > 18)) {
      return sendWhats("WhatsApp sent >18h ago; ping again or call.", "normal");
    }
  }

  if (status === "unfollowed") {
    if (!hCall || hCall > 2) return callNow("Unfollowed but no call in last 2h.", "high");
  }

  // Fallback by score
  if (score >= 70) return callNow("High urgency score; immediate call recommended.", "high");
  if (score >= 40) return sendWhats("Moderate urgency; send WhatsApp follow-up.", "normal");
  if (score >= 20) return sendEmail("Low urgency; send a brief check-in email.", "low");

  return { action: "CHECK_INTEREST", label: "Light touch base", urgency: "low", reason: "Very low urgency; optional nudge." };
}
