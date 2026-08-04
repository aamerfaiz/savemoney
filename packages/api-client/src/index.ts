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
  };
}

export { ApiError };
