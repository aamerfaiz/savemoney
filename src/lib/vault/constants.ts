/** Shared between src/lib/vault/actions.ts (validation) and the Settings UI
 * (the duration picker) — kept out of actions.ts because a "use server"
 * file may only export async functions, not plain constants. */
export const MCP_TOKEN_MAX_DURATION_DAYS = 365;

export const MCP_TOKEN_DURATION_PRESETS_DAYS = [7, 30, 90, 365] as const;

/** After this many wrong PIN attempts in a row, the device-local quick-unlock
 * wrap is wiped from IndexedDB and the user falls back to the full
 * passphrase or recovery code (Phase 3.5.6 — see the doc's "Device-local
 * quick-unlock" decision). A local, client-side counter only — there's no
 * server-side database of wrapped keys to throttle against. */
export const PIN_MAX_ATTEMPTS = 8;
