"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, LogIn, Sparkles, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { enterGuestMode } from "@/lib/guest/session";

const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Mode = "password" | "magic";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/dashboard";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withSupabase(fn: () => Promise<void>) {
    if (!supabaseConfigured) {
      setError(
        "Supabase isn't configured yet. Add your env vars, or continue to the demo below.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const signInPassword = () =>
    withSupabase(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push(redirectTo);
      router.refresh();
    });

  const sendMagicLink = () =>
    withSupabase(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMessage("Check your inbox for a magic sign-in link.");
    });

  const signInGoogle = () =>
    withSupabase(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    });

  const continueAsGuest = async () => {
    setGuestLoading(true);
    setError(null);
    try {
      await enterGuestMode();
      router.push(redirectTo);
      router.refresh();
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={continueAsGuest}
        disabled={guestLoading}
      >
        <UserRound className="size-4" />
        {guestLoading ? "Setting up…" : "Login as guest"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No sign-up needed. Everything you enter stays on this device.
      </p>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={signInGoogle}
        disabled={loading}
      >
        <GoogleGlyph />
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "password") signInPassword();
          else sendMagicLink();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {mode === "password" && (
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}

        {error && <p className="text-sm text-negative">{error}</p>}
        {message && <p className="text-sm text-positive">{message}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {mode === "password" ? (
            <>
              <LogIn className="size-4" /> Sign in
            </>
          ) : (
            <>
              <Mail className="size-4" /> Send magic link
            </>
          )}
        </Button>
      </form>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          setMode((m) => (m === "password" ? "magic" : "password"));
          setError(null);
          setMessage(null);
        }}
      >
        <Sparkles className="size-3.5" />
        {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
      </button>

      {!supabaseConfigured && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          Supabase not configured.{" "}
          <a href="/dashboard" className="font-medium text-brand">
            Continue to the demo dashboard →
          </a>
        </div>
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
