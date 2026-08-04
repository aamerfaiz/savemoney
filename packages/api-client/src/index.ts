/**
 * Typed client for the bearer-token `/api/v1/*` Route Handlers (Phase 5.3
 * — see docs/mobile-build-phase-plan.md §2 blocker #1/#2, §5 step 3).
 *
 * apps/web never needs this — it calls Server Actions directly, same as
 * always. This exists for apps/mobile (and any other non-browser client),
 * which can't invoke a `"use server"` function directly (Server Actions
 * are bound to Next's RSC action-id protocol) and instead needs a plain
 * REST call with an `Authorization: Bearer <supabase-access-token>`
 * header — the same access token Supabase Auth mints from the mobile
 * PKCE sign-in flow (Phase 5.4).
 *
 * Deliberately just a thin `fetch` wrapper, not a generated SDK: routes
 * are added one at a time as each module gets its own `/api/v1/<module>`
 * Route Handler (vault first, since Phase 5.4 needs it immediately;
 * transactions/budgets/goals/loans/investments/net-worth follow
 * alongside each module's Phase 5.5 screen port — see the build plan for
 * why those aren't all built speculatively up front).
 */

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

export interface Argon2Params {
  iterations: number;
  parallelism: number;
  memorySize: number;
  hashLength: number;
}

export interface VaultStatus {
  hasVault: boolean;
  recoveryAcknowledged: boolean;
  isOAuthOnly: boolean;
}

export type VaultBlob =
  | { hasVault: false }
  | {
      hasVault: true;
      passwordWrap: EncryptedPayload;
      passwordSalt: string;
      passwordKdfParams: Argon2Params;
      recoveryWrap: EncryptedPayload;
      recoverySalt: string;
    };

export interface SetupVaultInput {
  passwordWrap: EncryptedPayload;
  passwordSalt: string;
  passwordKdfParams: Argon2Params;
  recoveryWrap: EncryptedPayload;
  recoverySalt: string;
}

export interface RotateVaultSecretInput {
  path: "password" | "recovery";
  wrap: EncryptedPayload;
  salt: string;
  kdfParams?: Argon2Params;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* ----------------------------------------------------------------------- */
/* Finance data — Phase 5.5b. One shared raw-fetch boundary (mirroring     */
/* apps/web/src/lib/finance/raw-data.ts's own "single fetch boundary"      */
/* design) reused by every module's screen, not a route per module.        */
/* ----------------------------------------------------------------------- */

export interface RawIncomeRow {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  receivedAt: string;
  isRecurring: boolean;
  frequency: string;
  sourceType: string | null;
}

export interface RawExpenseRow {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  note: string | null;
  tags: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  spentAt: string;
  isRecurring: boolean;
  frequency: string;
}

export interface RawContributionRow {
  id: string;
  amount: string;
  contributedAt: string;
  note: string | null;
  goalName: string | null;
  goalIcon: string | null;
  goalDeletedAt: string | null;
}

export interface RawBudgetRow {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  period: string;
  amount: string;
  currency: string;
}

export interface RawActiveGoalRow {
  targetAmount: string;
  currentAmount: string;
  monthlyContribution: string | null;
  deadline: string | null;
}

export interface RawLoanAmountRow {
  emi: string;
  extraEmi: string | null;
  remainingAmount: string;
}

export interface FinanceRawData {
  income: RawIncomeRow[];
  expenses: RawExpenseRow[];
  contributions: RawContributionRow[];
  budgets: RawBudgetRow[];
  activeGoals: RawActiveGoalRow[];
  loans: RawLoanAmountRow[];
  investmentMonthlyContributions: (string | null)[];
  investmentContributions: { id: string; amount: string; contributedAt: string }[];
}

/* ----------------------------------------------------------------------- */
/* Transactions — Phase 5.5b, the reference module.                        */
/* ----------------------------------------------------------------------- */

export type TransactionKind = "income" | "expense";

export interface EncryptedTransactionInput {
  kind: TransactionKind;
  /** Packed ciphertext. */
  amount: string;
  currency: string;
  date: string;
  categoryId?: string | null;
  accountId?: string | null;
  /** Packed ciphertext, or null. */
  description?: string | null;
  isRecurring: boolean;
  frequency: string;
  sourceType?: string;
  /** Packed ciphertext, or null. expense only. */
  note?: string | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: TransactionKind;
  icon: string | null;
}

export interface AccountOption {
  id: string;
  name: string;
}

/* ----------------------------------------------------------------------- */
/* Budgets — Phase 5.5c. Reads reuse finance.raw() (its budgets/income/     */
/* expenses/activeGoals/loans/investmentMonthlyContributions fields are     */
/* exactly what computeBudgetsData() needs) — this is create/update/       */
/* delete only, no separate read route.                                    */
/* ----------------------------------------------------------------------- */

export type BudgetPeriod = "weekly" | "monthly" | "yearly";

export interface EncryptedBudgetInput {
  categoryId?: string | null;
  period: BudgetPeriod;
  /** Packed ciphertext. */
  amount: string;
  currency: string;
  startsOn: string;
}

export type ApiClientConfig = {
  /** e.g. "https://your-deployment.vercel.app" — no trailing slash. */
  baseUrl: string;
  /** Called before every request. Return `null` to send no
   * `Authorization` header at all (falls through to a cookie session,
   * which only makes sense from a browser — every apps/mobile caller
   * must return a real token here). */
  getAccessToken: () => Promise<string | null>;
};

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await config.getAccessToken();
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      throw new ApiError(body?.error ?? `Request failed (${response.status}).`, response.status);
    }
    return body as T;
  }

  return {
    vault: {
      status: () => request<{ ok: true; status: VaultStatus }>("/api/v1/vault/status"),
      unlock: () => request<{ ok: true } & VaultBlob>("/api/v1/vault/unlock"),
      setup: (input: SetupVaultInput) =>
        request<ActionResult>("/api/v1/vault/setup", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      rotate: (input: RotateVaultSecretInput) =>
        request<ActionResult>("/api/v1/vault/rotate", {
          method: "POST",
          body: JSON.stringify(input),
        }),
    },
    finance: {
      /** Everything income/expenses/budgets/goals/loans/investments
       * screens need, as packed ciphertext — decrypt client-side before
       * use. Same shared boundary every module reuses (Phase 5.5c),
       * not a route built per module. */
      raw: () => request<{ ok: true } & FinanceRawData>("/api/v1/finance/raw"),
    },
    transactions: {
      create: (input: EncryptedTransactionInput) =>
        request<ActionResult>("/api/v1/transactions", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      update: (id: string, input: EncryptedTransactionInput) =>
        request<ActionResult>(`/api/v1/transactions/${id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        }),
      delete: (id: string, kind: TransactionKind) =>
        request<ActionResult>(`/api/v1/transactions/${id}?kind=${kind}`, {
          method: "DELETE",
        }),
      reference: () =>
        request<{ ok: true; categories: CategoryOption[]; accounts: AccountOption[] }>(
          "/api/v1/transactions/reference",
        ),
    },
    budgets: {
      create: (input: EncryptedBudgetInput) =>
        request<ActionResult>("/api/v1/budgets", { method: "POST", body: JSON.stringify(input) }),
      update: (id: string, input: EncryptedBudgetInput) =>
        request<ActionResult>(`/api/v1/budgets/${id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        }),
      delete: (id: string) =>
        request<ActionResult>(`/api/v1/budgets/${id}`, { method: "DELETE" }),
    },
  };
}

export { ApiError };
