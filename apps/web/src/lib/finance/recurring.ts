/**
 * Recurring schedule projection (pure).
 *
 * A recurring rule fires an amount on a cadence (`frequency` every `interval`
 * periods) starting from `startDate`, optionally ending at `endDate`. From that
 * we derive, without any I/O:
 *  - the next occurrence on/after a reference date,
 *  - every occurrence inside a window (for the bill calendar), and
 *  - the amount normalized to a monthly figure so recurring outflows can feed
 *    safe-to-spend the same way loan EMIs and SIPs do.
 *
 * Kept dependency-free so it runs on the server (calendar/dashboard) and the
 * client (instant preview) and is unit-testable without a database.
 */

export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface RecurrenceInput {
  /** First occurrence / anchor date (ISO yyyy-mm-dd). */
  startDate: string;
  frequency: RecurringFrequency;
  /** Repeat every N periods (>= 1). Defaults to 1. */
  interval?: number | null;
  /** Last date the rule is valid, inclusive (ISO yyyy-mm-dd). Optional. */
  endDate?: string | null;
}

/** Occurrences per month for a single-interval rule (used to annualize spend). */
const PER_MONTH: Record<RecurringFrequency, number> = {
  daily: 30.436875,
  weekly: 52.177457 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

const DAY_MS = 1000 * 60 * 60 * 24;

/** Parse an ISO date at local midnight (dates are day-precision, no tz games). */
function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Advance `date` by `steps` periods of `frequency` from the anchor. Monthly and
 * longer cadences preserve the anchor's day-of-month, clamping to the last day
 * of shorter months (e.g. a 31st rule lands on Feb 28/29).
 */
function advance(
  anchor: Date,
  frequency: RecurringFrequency,
  interval: number,
  steps: number,
): Date {
  const n = interval * steps;
  if (frequency === "daily") return new Date(anchor.getTime() + n * DAY_MS);
  if (frequency === "weekly") return new Date(anchor.getTime() + n * 7 * DAY_MS);

  const monthsPer =
    frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const targetMonth = anchor.getMonth() + n * monthsPer;
  const y = anchor.getFullYear() + Math.floor(targetMonth / 12);
  const m = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(anchor.getDate(), lastDay);
  return new Date(y, m, day);
}

/** Normalize the interval to a safe positive integer. */
function normInterval(interval?: number | null): number {
  const n = Math.trunc(interval ?? 1);
  return n >= 1 ? n : 1;
}

/**
 * The next occurrence on/after `from` (default: today), or null when the rule
 * has already ended. `from` is treated at day precision.
 */
export function nextOccurrence(
  rule: RecurrenceInput,
  from: Date = new Date(),
): string | null {
  const anchor = parseISO(rule.startDate);
  if (Number.isNaN(anchor.getTime())) return null;
  const interval = normInterval(rule.interval);
  const end = rule.endDate ? parseISO(rule.endDate) : null;
  const fromDay = atMidnight(from);

  // Anchor is in the future — first fire is the anchor itself.
  if (anchor >= fromDay) {
    if (end && anchor > end) return null;
    return toISO(anchor);
  }

  // Estimate how many whole steps have elapsed, then nudge to land on/after.
  const approx = estimateSteps(anchor, fromDay, rule.frequency, interval);
  let steps = Math.max(0, approx - 2);
  for (let i = 0; i < 512; i++) {
    const occ = advance(anchor, rule.frequency, interval, steps);
    if (occ >= fromDay) {
      if (end && occ > end) return null;
      return toISO(occ);
    }
    steps++;
  }
  return null;
}

/** Rough step count between anchor and target — a starting point for the loop. */
function estimateSteps(
  anchor: Date,
  target: Date,
  frequency: RecurringFrequency,
  interval: number,
): number {
  const days = (target.getTime() - anchor.getTime()) / DAY_MS;
  const perStepDays =
    (frequency === "daily"
      ? 1
      : frequency === "weekly"
        ? 7
        : 30.436875 / PER_MONTH[frequency]) * interval;
  return Math.floor(days / perStepDays);
}

/**
 * Every occurrence in the inclusive window [start, end]. Capped so a runaway
 * daily rule over a huge window can't allocate without bound.
 */
export function occurrencesBetween(
  rule: RecurrenceInput,
  start: Date,
  end: Date,
  cap = 366,
): string[] {
  const out: string[] = [];
  const ruleEnd = rule.endDate ? parseISO(rule.endDate) : null;
  const windowEnd = ruleEnd && ruleEnd < end ? ruleEnd : end;

  let next = nextOccurrence(rule, start);
  const interval = normInterval(rule.interval);
  const anchor = parseISO(rule.startDate);

  // Walk forward from the first occurrence in-window step by step.
  let guard = 0;
  while (next && guard < cap) {
    const d = parseISO(next);
    if (d > windowEnd) break;
    out.push(next);
    guard++;
    // Advance one step past the current occurrence.
    const from = new Date(d.getTime() + DAY_MS);
    const stepsFromAnchor =
      estimateSteps(anchor, atMidnight(from), rule.frequency, interval) + 2;
    let s = Math.max(0, stepsFromAnchor - 4);
    let advanced: string | null = null;
    for (let i = 0; i < 512; i++) {
      const occ = advance(anchor, rule.frequency, interval, s);
      if (occ >= from) {
        advanced = toISO(occ);
        break;
      }
      s++;
    }
    next = advanced;
  }
  return out;
}

/** The rule's amount expressed as an equivalent monthly figure. */
export function monthlyAmount(amount: number, rule: RecurrenceInput): number {
  const interval = normInterval(rule.interval);
  return (amount * PER_MONTH[rule.frequency]) / interval;
}
