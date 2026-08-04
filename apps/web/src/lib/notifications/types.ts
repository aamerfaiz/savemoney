export type NotificationType =
  | "bill_due"
  | "budget_overspend"
  | "goal_milestone"
  | "low_safe_to_spend"
  | "loan_paid_off"
  | "general";

export type NotificationSeverity = "info" | "warning" | "positive";

/** A generated alert before persistence. `dedupeKey` is its stable identity. */
export interface NotificationDraft {
  dedupeKey: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string;
  /** Event date (ISO yyyy-mm-dd) used for ordering. */
  date: string;
}

/** A draft with its persisted read/dismiss state applied. */
export interface NotificationItem extends NotificationDraft {
  isRead: boolean;
}
