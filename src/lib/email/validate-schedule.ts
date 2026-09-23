/**
 * Guards that stop a campaign being scheduled in a way that can never send.
 *
 * Why this exists: on 2026-09-22 a recurring campaign was created at 3:31 PM with
 * an end date of that same day. The AI correctly picked the next morning for the
 * first send, two Resend broadcasts were created, and the nightly cron then saw
 * "end date has passed", marked the campaign completed and cancelled both. Nothing
 * sent and nothing warned. An end date at or before the first send is always a
 * mistake, so it is rejected up front now.
 */

/** Phoenix has no DST, so its offset is always -07:00. */
const PHOENIX_OFFSET = "-07:00";

/**
 * An "Ends" date from the composer is a plain YYYY-MM-DD. Treat it as the END of
 * that day in Phoenix, so "ends Sep 30" still allows a send on Sep 30.
 */
export function endOfDayPhoenix(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59${PHOENIX_OFFSET}`);
}

/** Accepts either a YYYY-MM-DD key or a full timestamp. */
function toEndInstant(endDate: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endOfDayPhoenix(endDate) : new Date(endDate);
}

/**
 * Why a campaign can't be scheduled, or null when it's fine.
 * `firstSend` is the slot being considered; omit it to check against "now".
 */
export function endDateProblem(
  endDate: string | null | undefined,
  firstSend?: string | Date | null,
  now: Date = new Date()
): string | null {
  if (!endDate) return null;

  const end = toEndInstant(endDate);
  if (Number.isNaN(end.getTime())) return "That end date isn't a real date.";

  if (end.getTime() < now.getTime()) {
    return "The end date is in the past, so this campaign would be closed before it ever sends. Pick a later date or clear it.";
  }

  if (firstSend) {
    const first = firstSend instanceof Date ? firstSend : new Date(firstSend);
    if (!Number.isNaN(first.getTime()) && first.getTime() > end.getTime()) {
      return "The first send would land after the end date, so nothing would go out. Move the end date later or clear it.";
    }
  }

  return null;
}
