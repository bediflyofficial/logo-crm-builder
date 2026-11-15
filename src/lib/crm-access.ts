export function hasCrmWorkspaceAccess(isPlatformAdmin: boolean, accessibleWorkspaceCount: number): boolean {
  return isPlatformAdmin || accessibleWorkspaceCount > 0;
}

export function resolveWorkspaceSelection(
  isPlatformAdmin: boolean,
  requestedId: string | undefined,
  currentId: string,
  accessibleIds: string[],
): string {
  if (requestedId && accessibleIds.includes(requestedId)) return requestedId;
  if (currentId && accessibleIds.includes(currentId)) return currentId;
  return isPlatformAdmin ? "" : accessibleIds[0] ?? "";
}

export function isWithinDateFilter(
  createdAt: string,
  filter: string,
  startDate: string,
  endDate: string,
  now = new Date(),
): boolean {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  if (filter === "All time") return true;
  let start: number | null = null;
  let end: number | null = null;
  let endExclusive = false;
  if (filter === "Custom range") {
    if (startDate && endDate && startDate > endDate) return false;
    start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    end = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
  } else {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (filter === "Today") { start = today.getTime(); end = tomorrow.getTime(); endExclusive = true; }
    else if (filter === "Yesterday") { start = new Date(today.getTime() - 86400000).getTime(); end = today.getTime(); endExclusive = true; }
    else if (filter === "Last 7 days") { start = now.getTime() - 7 * 86400000; end = now.getTime(); }
    else if (filter === "Last 30 days") { start = now.getTime() - 30 * 86400000; end = now.getTime(); }
    else if (filter === "This month") { start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); end = now.getTime(); }
    else return false;
  }
  return (start === null || timestamp >= start) && (end === null || (endExclusive ? timestamp < end : timestamp <= end));
}

export function clampLeadScore(score: number): number {
  return Math.max(0, Math.min(100, Math.trunc(score)));
}

export function calculateLeadScore(
  input: { phoneValid: boolean; emailValid: boolean; status: string },
  scoring: {
    validPhone: number;
    validEmail: number;
    respondedCall: number;
    expressedInterest: number;
    meetingScheduled: number;
    converted: number;
    invalidNumber: number;
    duplicate: number;
    junkLead: number;
  },
): number {
  let score = 0;
  if (input.phoneValid) score += scoring.validPhone;
  if (input.emailValid) score += scoring.validEmail;
  if (["Contacted", "Interested", "Qualified", "Meeting Scheduled", "Negotiation", "Converted"].includes(input.status)) score += scoring.respondedCall;
  if (["Interested", "Qualified", "Meeting Scheduled", "Negotiation", "Converted"].includes(input.status)) score += scoring.expressedInterest;
  if (["Meeting Scheduled", "Negotiation", "Converted"].includes(input.status)) score += scoring.meetingScheduled;
  if (input.status === "Converted") score += scoring.converted;
  if (input.status === "Invalid Number") score += scoring.invalidNumber;
  if (input.status === "Duplicate") score += scoring.duplicate;
  if (input.status === "Junk Lead") score += scoring.junkLead;
  return clampLeadScore(score);
}
