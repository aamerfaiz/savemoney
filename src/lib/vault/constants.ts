/** Shared between src/lib/vault/actions.ts (validation) and the Settings UI
 * (the duration picker) — kept out of actions.ts because a "use server"
 * file may only export async functions, not plain constants. */
export const MCP_TOKEN_MAX_DURATION_DAYS = 365;

export const MCP_TOKEN_DURATION_PRESETS_DAYS = [7, 30, 90, 365] as const;
