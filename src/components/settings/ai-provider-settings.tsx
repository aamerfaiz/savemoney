"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PROVIDER_META } from "@/lib/ai/meta";
import {
  deleteProviderKey,
  saveProviderKey,
  setActiveProviderKey,
  testProviderKey,
  type ActionResult,
} from "@/lib/ai/actions";
import type { ProviderKeyMeta } from "@/lib/ai/queries";

export function AiProviderSettings({ keys }: { keys: ProviderKeyMeta[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [provider, setProvider] = useState(PROVIDER_META[0].id);

  const [testState, testAction, testPending] = useActionState<
    ActionResult | undefined,
    FormData
  >(testProviderKey, undefined);
  const [saveState, saveAction, savePending] = useActionState<
    ActionResult | undefined,
    FormData
  >(saveProviderKey, undefined);

  useEffect(() => {
    if (saveState?.ok) router.refresh();
  }, [saveState, router]);

  const meta = PROVIDER_META.find((p) => p.id === provider)!;

  const onSetActive = (id: string) => {
    startTransition(async () => {
      await setActiveProviderKey(id);
      router.refresh();
    });
  };

  const onDelete = (id: string, label: string) => {
    if (!confirm(`Remove the ${label} key?`)) return;
    startTransition(async () => {
      await deleteProviderKey(id);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {keys.length > 0 && (
        <ul className="space-y-2">
          {keys.map((k) => {
            const label =
              PROVIDER_META.find((p) => p.id === k.provider)?.label ?? k.provider;
            return (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {k.label || label}
                    </span>
                    {k.isActive && <Badge variant="brand">Active</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {label} · {k.model ?? "default model"} · ••••{k.keyLast4}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!k.isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onSetActive(k.id)}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${label} key`}
                    onClick={() => onDelete(k.id, k.label || label)}
                  >
                    <Trash2 className="size-4 text-negative" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={saveAction} className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-brand" />
          Connect a provider
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="provider">Provider</Label>
          <Select
            id="provider"
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
          >
            {PROVIDER_META.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.label}
                {!p.available ? " (coming soon)" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apiKey">API key</Label>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            placeholder={meta.keyPlaceholder}
            autoComplete="off"
            required
            disabled={!meta.available}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="model">Model (optional)</Label>
            <Input
              id="model"
              name="model"
              placeholder={meta.defaultModel}
              disabled={!meta.available}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label">Label (optional)</Label>
            <Input
              id="label"
              name="label"
              placeholder="e.g. Personal"
              disabled={!meta.available}
            />
          </div>
        </div>

        {(testState?.error || saveState?.error) && (
          <p className="flex items-center gap-1.5 text-sm text-negative">
            <CircleAlert className="size-4 shrink-0" />
            {testState?.error || saveState?.error}
          </p>
        )}
        {testState?.ok && (
          <p className="flex items-center gap-1.5 text-sm text-positive">
            <Check className="size-4 shrink-0" /> Connection works.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            formAction={testAction}
            variant="outline"
            disabled={testPending || savePending || !meta.available}
          >
            {testPending ? "Testing…" : "Test connection"}
          </Button>
          <Button type="submit" disabled={testPending || savePending || !meta.available}>
            {savePending ? "Saving…" : "Save key"}
          </Button>
        </div>
        {!meta.available && (
          <p className="text-xs text-muted-foreground">
            {meta.label} is on the Phase 3 roadmap — DeepSeek is the only
            provider wired up today.
          </p>
        )}
      </form>
    </div>
  );
}
