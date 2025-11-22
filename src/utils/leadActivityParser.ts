// Lead activity parser for extracting last contact timestamps from remark text.
// Example remark:
// "Client interested. Last Call: 2025-11-01 14:30, Last WA: 2025-11-01 15:10, Last Email: 2025-10-31 11:00, Last Status: 2025-11-01 16:00"
// Parsed:
// {
//   lastCallAt: "2025-11-01T14:30:00.000Z",
//   lastWhatsappAt: "2025-11-01T15:10:00.000Z",
//   lastEmailAt: "2025-10-31T11:00:00.000Z",
//   lastStatusChangeAt: "2025-11-01T16:00:00.000Z",
//   lastRemarkAt: "2025-11-01T16:00:00.000Z"
// }

export interface LeadActivity {
  lastCallAt?: string;
  lastWhatsappAt?: string;
  lastEmailAt?: string;
  lastStatusChangeAt?: string;
  lastRemarkAt?: string;
}

const callRegex = /Last\s*Call\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})/i;
const waRegex = /(Last\s*WA|Last\s*Whatsapp)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})/i;
const emailRegex = /Last\s*Email\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})/i;
const statusRegex = /Last\s*Status\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})/i;

function toIso(match?: string): string | undefined {
  if (!match) return undefined;
  const d = new Date(match.replace(/\s+/, "T"));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function parseLeadActivityFromRemark(remark: string): LeadActivity {
  const text = remark || "";
  const call = callRegex.exec(text)?.[1];
  const wa = waRegex.exec(text)?.[2] || waRegex.exec(text)?.[1];
  const email = emailRegex.exec(text)?.[1];
  const lastStatus = statusRegex.exec(text)?.[1];

  const lastCallAt = toIso(call);
  const lastWhatsappAt = toIso(wa);
  const lastEmailAt = toIso(email);
  const lastStatusChangeAt = toIso(lastStatus);

  const candidates = [lastCallAt, lastWhatsappAt, lastEmailAt, lastStatusChangeAt].filter(Boolean) as string[];
  const lastRemarkAt = candidates.length ? candidates.sort().slice(-1)[0] : undefined;

  return { lastCallAt, lastWhatsappAt, lastEmailAt, lastStatusChangeAt, lastRemarkAt };
}
