import { create } from "zustand";

/**
 * Mirrors apps/web/src/lib/vault/store.ts exactly: the unwrapped DEK held
 * only in memory for this app session's lifetime — never persisted (no
 * zustand `persist` middleware, deliberately). Force-quitting or
 * backgrounding-then-killing the app clears it; the user unlocks again
 * via their passphrase or recovery code (device PIN/biometric quick-
 * unlock is a later Phase 5 enhancement, not v1 — see
 * docs/mobile-build-phase-plan.md §0).
 */
interface VaultState {
  dek: CryptoKey | null;
  unlock: (dek: CryptoKey) => void;
  lock: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  dek: null,
  unlock: (dek) => set({ dek }),
  lock: () => set({ dek: null }),
}));
