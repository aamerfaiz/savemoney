import { VaultScreen } from "../src/screens/vault-screen";

/** No `onUnlocked` callback needed — the root layout's `Stack.Protected`
 * guard reacts to `useVaultStore`'s `dek` changing and swaps to
 * `(tabs)` on its own once `VaultScreen` calls `unlock()`. */
export default function Vault() {
  return <VaultScreen />;
}
