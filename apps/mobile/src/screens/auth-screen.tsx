import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { isSupabaseConfigured, supabase } from "../lib/supabase/client";

/**
 * Phase 5.4 (see docs/mobile-build-phase-plan.md §5 step 4) — email/
 * password sign-in/sign-up, mirroring apps/web/src/app/login/auth-form.tsx's
 * password path. Magic link and Google OAuth need PKCE + a deep-link
 * redirect back into the app (`app.json`'s `scheme` is set up for this)
 * and aren't wired yet — that's the explicit gap this phase leaves open,
 * same honesty pattern as the Argon2id fallback in
 * src/lib/vault/crypto.ts. Not real navigation (Phase 5.5 builds that) —
 * App.tsx renders this directly while there's no session.
 */
export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setMessage(null);
    if (!isSupabaseConfigured) {
      setError("Supabase isn't configured (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY).");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Finance OS</Text>
      <Text style={styles.subtitle}>
        {mode === "signIn" ? "Sign in" : "Create an account"}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {message && <Text style={styles.info}>{message}</Text>}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === "signIn" ? "Sign in" : "Sign up"}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
        <Text style={styles.switchMode}>
          {mode === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", padding: 24, justifyContent: "center", gap: 12 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "#888", textAlign: "center", marginBottom: 16 },
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
  buttonText: { color: "#fff", fontWeight: "600" },
  switchMode: { color: "#a78bfa", textAlign: "center", marginTop: 12 },
  error: { color: "#f87171" },
  info: { color: "#4ade80" },
});
