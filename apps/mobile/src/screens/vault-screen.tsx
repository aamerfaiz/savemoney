import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { apiClient } from "../lib/api/client";
import {
  PASSPHRASE_KDF_PARAMS,
  deriveKekFromHighEntropySecret,
  deriveKekFromSecret,
  fromBase64,
  generateDek,
  generateRecoveryCode,
  randomBytes,
  toBase64,
  unwrapDek,
  wrapDek,
  type Argon2Params,
} from "../lib/vault/crypto";
import { useVaultStore } from "../lib/vault/store";

/**
 * Phase 5.4 (see docs/mobile-build-phase-plan.md §5 step 4) — ports
 * apps/web/src/components/vault/vault-unlock-flow.tsx's setup/unlock
 * protocol exactly (same salts, same KDF params, same HKDF `info` string
 * "vault-recovery-kek") so a vault set up on one client unlocks on the
 * other. Recovery-code-based unlock (forgotten passphrase) isn't wired
 * yet — only the passphrase path, which covers the common case; that's
 * the one thing this screen leaves out relative to the web flow.
 */
type Mode = "checking" | "setup" | "showRecovery" | "unlock" | "error";

export function VaultScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [mode, setMode] = useState<Mode>("checking");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [recoveryDisplay, setRecoveryDisplay] = useState<string | null>(null);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [pendingSetup, setPendingSetup] = useState<{
    dek: CryptoKey;
    passwordWrap: { ciphertext: string; iv: string };
    passwordSalt: Uint8Array<ArrayBuffer>;
    recoveryWrap: { ciphertext: string; iv: string };
    recoverySalt: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlockVault = useVaultStore((s) => s.unlock);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await apiClient.vault.status();
        setMode(status.hasVault ? "unlock" : "setup");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't reach the server.");
        setMode("error");
      }
    })();
  }, []);

  function finishUnlock(dek: CryptoKey) {
    unlockVault(dek);
    onUnlocked();
  }

  async function handleSetup() {
    setError(null);
    if (passphrase.length < 10) {
      setError("Use at least 10 characters for your vault passphrase.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      const dek = await generateDek();

      const passwordSalt = randomBytes(16);
      const passwordKek = await deriveKekFromSecret(passphrase, passwordSalt, PASSPHRASE_KDF_PARAMS);
      const passwordWrap = await wrapDek(dek, passwordKek);

      const recovery = generateRecoveryCode();
      const recoverySalt = randomBytes(16);
      const recoveryKek = await deriveKekFromHighEntropySecret(
        recovery.bytes,
        recoverySalt,
        "vault-recovery-kek",
      );
      const recoveryWrap = await wrapDek(dek, recoveryKek);

      setPendingSetup({ dek, passwordWrap, passwordSalt, recoveryWrap, recoverySalt });
      setRecoveryDisplay(recovery.display);
      setMode("showRecovery");
    } catch {
      setError("Couldn't set up the vault on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSetup() {
    if (!pendingSetup || !recoveryConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.vault.setup({
        passwordWrap: pendingSetup.passwordWrap,
        passwordSalt: toBase64(pendingSetup.passwordSalt),
        passwordKdfParams: PASSPHRASE_KDF_PARAMS,
        recoveryWrap: pendingSetup.recoveryWrap,
        recoverySalt: toBase64(pendingSetup.recoverySalt),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the vault.");
        setBusy(false);
        return;
      }
      const dek = pendingSetup.dek;
      setPendingSetup(null);
      setRecoveryDisplay(null);
      setPassphrase("");
      setConfirmPassphrase("");
      finishUnlock(dek);
    } catch {
      setError("Something went wrong saving the vault.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError(null);
    setBusy(true);
    try {
      let blob;
      try {
        blob = await apiClient.vault.unlock();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't reach the server.");
        return;
      }
      if (!blob.hasVault) {
        setMode("setup");
        return;
      }
      try {
        const kek = await deriveKekFromSecret(
          passphrase,
          fromBase64(blob.passwordSalt),
          blob.passwordKdfParams as Argon2Params,
        );
        const unwrapped = await unwrapDek(blob.passwordWrap, kek);
        setPassphrase("");
        finishUnlock(unwrapped);
      } catch {
        setError("Incorrect passphrase.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === "checking") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#8400ff" />
      </View>
    );
  }

  if (mode === "error") {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (mode === "showRecovery" && recoveryDisplay) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Save your recovery code</Text>
        <Text style={styles.subtitle}>
          This is the only time this code is shown. If you forget your passphrase, it's the
          only way back into your data.
        </Text>
        <Text style={styles.recoveryCode}>{recoveryDisplay}</Text>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setRecoveryConfirmed(!recoveryConfirmed)}
        >
          <View style={[styles.checkbox, recoveryConfirmed && styles.checkboxChecked]} />
          <Text style={styles.checkboxLabel}>I've saved this code somewhere safe</Text>
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, !recoveryConfirmed && styles.buttonDisabled]}
          onPress={handleConfirmSetup}
          disabled={!recoveryConfirmed || busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
      </ScrollView>
    );
  }

  const isSetup = mode === "setup";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isSetup ? "Set up your vault" : "Unlock your vault"}</Text>
      <Text style={styles.subtitle}>
        {isSetup
          ? "Every finance value is encrypted on your device — pick a vault passphrase (separate from your login password)."
          : "Enter your vault passphrase to decrypt your data."}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Vault passphrase"
        placeholderTextColor="#666"
        secureTextEntry
        value={passphrase}
        onChangeText={setPassphrase}
      />
      {isSetup && (
        <TextInput
          style={styles.input}
          placeholder="Confirm passphrase"
          placeholderTextColor="#666"
          secureTextEntry
          value={confirmPassphrase}
          onChangeText={setConfirmPassphrase}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={isSetup ? handleSetup : handleUnlock} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isSetup ? "Create vault" : "Unlock"}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", padding: 24, justifyContent: "center", gap: 12 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#888", marginBottom: 8 },
  input: {
    backgroundColor: "#1a1a22",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: "#8400ff",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#f87171" },
  recoveryCode: {
    color: "#fbbf24",
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    backgroundColor: "#1a1a22",
    padding: 16,
    borderRadius: 8,
    marginVertical: 16,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: "#8400ff" },
  checkboxChecked: { backgroundColor: "#8400ff" },
  checkboxLabel: { color: "#ccc", flexShrink: 1 },
});
