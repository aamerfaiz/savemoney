import { Suspense } from "react";

import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in · Finance OS" };

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(132,0,255,0.55) 0%, transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-brand text-brand-foreground text-lg font-bold shadow-[0_0_30px_-4px_var(--color-brand)]">
            F
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Finance OS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personal financial operating system
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card/70 p-6 backdrop-blur">
          <Suspense fallback={<div className="h-80" />}>
            <AuthForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to the Terms &amp; Privacy Policy.
        </p>
      </div>
    </div>
  );
}
