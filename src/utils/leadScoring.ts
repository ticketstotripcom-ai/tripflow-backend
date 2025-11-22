import { LeadActivity } from "./leadActivityParser";

export interface LeadForScoring {
  id: string;
  travellerName: string;
  status: string;
  remark: string;
  assignedToEmail?: string;
  createdAt?: string;
  activity: LeadActivity;
}

const STATUS_WEIGHTS: Record<string, number> = {
  "Hot Leads": 40,
  "Negotiations": 30,
  "Proposal 3 Shared": 25,
  "Proposal 2 Shared": 22,
  "Proposal 1 Shared": 20,
  "Working on it": 15,
  "Follow-up Calls - 5": 14,
  "Follow-up Calls - 4": 13,
  "Follow-up Calls - 3": 12,
  "Follow-up Calls - 2": 11,
  "Follow-up Calls - 1": 10,
  "Follow-up Calls": 10,
  "Whatsapp Sent": 8,
  "Unfollowed": 5,
  "Pamplets Shared": 3,
  "Booked With Us": -100,
  "Cancellations": -50,
  "Postponed": -30,
  "Booked Outside": -50,
};

const POSITIVE_KEYWORDS = ["interested", "very keen", "serious", "will confirm", "finalizing", "almost done"];
const PRICE_KEYWORDS = ["price", "budget", "too expensive", "costly"];
const NON_RESPONSE_KEYWORDS = ["not picking up", "no response", "didn't answer", "didnt answer"];
const NEGATIVE_KEYWORDS = ["not interested", "no longer interested", "stop calling", "do not call"];

function hoursSince(iso?: string, now: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / 36e5;
}

function timeContribution(hours: number | null): number {
  if (hours === null) return 0;
  if (hours < 6) return 0;
  if (hours < 12) return 3;
  if (hours < 24) return 6;
  if (hours < 48) return 10;
  if (hours < 72) return 15;
  return 20;
}

export function calculateLeadUrgencyScore(lead: LeadForScoring, now: Date = new Date()): number {
  const statusWeight = STATUS_WEIGHTS[lead.status] ?? 0;

  const timeParts = [
    timeContribution(hoursSince(lead.activity.lastCallAt, now)),
    timeContribution(hoursSince(lead.activity.lastWhatsappAt, now)),
    timeContribution(hoursSince(lead.activity.lastEmailAt, now)),
    timeContribution(hoursSince(lead.activity.lastStatusChangeAt, now)),
  ];
  let timeDecay = timeParts.reduce((a, b) => a + b, 0);
  if (!lead.activity.lastCallAt && !lead.activity.lastWhatsappAt && !lead.activity.lastEmailAt && !lead.activity.lastStatusChangeAt) {
    timeDecay += 10;
  }
  timeDecay = Math.min(timeDecay, 30);

  const remark = (lead.remark || "").toLowerCase();
  let behaviour = 0;
  if (POSITIVE_KEYWORDS.some((k) => remark.includes(k))) behaviour += 15;
  if (PRICE_KEYWORDS.some((k) => remark.includes(k))) behaviour += 10;
  if (NON_RESPONSE_KEYWORDS.some((k) => remark.includes(k))) behaviour += 5;
  if (NEGATIVE_KEYWORDS.some((k) => remark.includes(k))) behaviour -= 40;

  // Age >7 days boosts urgency unless already closed/negative
  if (!["booked with us", "cancellations", "booked outside", "postponed"].includes(lead.status.toLowerCase())) {
    if (lead.createdAt) {
      const createdHours = hoursSince(lead.createdAt, now);
      if (createdHours !== null && createdHours > 24 * 7) behaviour += 15;
    }
  }
  behaviour = Math.max(-40, Math.min(behaviour, 25));

  let score = statusWeight + timeDecay + behaviour;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return score;
}
