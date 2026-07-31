"use client";

import { create } from "zustand";

/**
 * The unwrapped DEK, held only in memory for this tab's lifetime — never
 * persisted (no zustand `persist` middleware, deliberately: no
 * localStorage/sessionStorage/IndexedDB here). Reloading the page or
 * closing the tab clears it; the user unlocks again via their passphrase,
 * recovery code, or (once built) device-local PIN quick-unlock.
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
