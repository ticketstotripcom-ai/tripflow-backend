export function normalizeStatus(status: string | undefined | null): string {
  return String(status || "").trim().toLowerCase();
}

export function isCancellationStatus(status: string | undefined | null): boolean {
  const s = normalizeStatus(status);
  // Match common variants
  return (
    s.includes("cancell") || // cancellations, cancelled, cancellation
    s.includes("canceled") ||
    s.includes("cancelled")
  );
}

export function isBookedStatus(status: string | undefined | null): boolean {
  const s = normalizeStatus(status);
  return s.includes("booked with us") || s === "converted" || s.includes("converted");
}

export function isWorkingCategoryStatus(status: string | undefined | null): boolean {
  const s = normalizeStatus(status);
  return (
    s.includes("follow-up") ||
    s.includes("working") ||
    s.includes("whatsapp") ||
    s.includes("proposal") ||
    s.includes("negotiations") ||
    s.includes("hot") ||
    isCancellationStatus(s)
  );
}

export function isNewCategoryStatus(status: string | undefined | null): boolean {
  const s = normalizeStatus(status);
  return s === "" || s.includes("unfollowed");
}
