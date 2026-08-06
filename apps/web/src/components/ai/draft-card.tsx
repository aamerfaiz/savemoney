"use client";

import { CircleAlert, Trash2, TriangleAlert, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/icon";
import {
  CAPABILITY_ICON,
  FIELD_SPECS,
  TARGET_KIND,
  transactionFieldSpecs,
  type DraftItemState,
  type SmartEntryReference,
  type TargetKind,
} from "./smart-entry-types";

const COMMITTING_LABEL: Record<DraftItemState["actionLabel"], string> = {
  Add: "Adding…",
  Save: "Saving…",
  Delete: "Deleting…",
};

export function DraftCard({
  draft,
  reference,
  onToggleSelect,
  onFieldChange,
  onTargetChange,
  onDiscard,
  onCommitOne,
}: {
  draft: DraftItemState;
  reference: SmartEntryReference;
  onToggleSelect: (id: string) => void;
  onFieldChange: (id: string, key: string, value: string) => void;
  onTargetChange: (id: string, targetId: string, targetLabel: string | undefined) => void;
  onDiscard: (id: string) => void;
  onCommitOne: (id: string) => void;
}) {
  if (!draft.ok) {
    return (
      <div className="rounded-lg border border-negative/30 bg-negative/5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 text-sm text-negative">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p>{draft.error ?? "Couldn't make sense of this part of your message."}</p>
              {draft.sourceText && (
                <p className="mt-1 text-xs text-muted-foreground">&ldquo;{draft.sourceText}&rdquo;</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDiscard(draft.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Discard"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const targetKind = TARGET_KIND[draft.capability];

  if (draft.destructive) {
    return (
      <div className="space-y-3 rounded-lg border border-negative/30 bg-negative/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.selected}
              onChange={() => onToggleSelect(draft.id)}
              className="size-4 accent-negative"
            />
            <span className="flex size-8 items-center justify-center rounded-full bg-negative/15 text-negative">
              <Trash2 className="size-4" />
            </span>
            <Badge variant="negative">{draft.moduleLabel}</Badge>
          </label>
          <button
            type="button"
            onClick={() => onDiscard(draft.id)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Discard"
          >
            <X className="size-4" />
          </button>
        </div>

        {targetKind && (
          <TargetPicker draft={draft} targetKind={targetKind} reference={reference} onTargetChange={onTargetChange} />
        )}

        {draft.warnings.map((w, i) => (
          <p key={i} className="flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {w}
          </p>
        ))}
        {draft.commitError && <p className="text-xs text-negative">{draft.commitError}</p>}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={draft.committing || !draft.targetId}
            onClick={() => onCommitOne(draft.id)}
          >
            {draft.committing ? COMMITTING_LABEL.Delete : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  const fields =
    draft.capability === "transaction.edit"
      ? transactionFieldSpecs(draft.fields.kind)
      : (FIELD_SPECS[draft.capability] ?? []);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.selected}
            onChange={() => onToggleSelect(draft.id)}
            className="size-4 accent-[var(--color-brand)]"
          />
          <span className="flex size-8 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Icon name={CAPABILITY_ICON[draft.capability]} className="size-4" />
          </span>
          <Badge variant="brand">{draft.moduleLabel}</Badge>
        </label>
        <button
          type="button"
          onClick={() => onDiscard(draft.id)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Discard"
        >
          <X className="size-4" />
        </button>
      </div>

      {targetKind && (
        <TargetPicker draft={draft} targetKind={targetKind} reference={reference} onTargetChange={onTargetChange} />
      )}

      <div className="grid grid-cols-2 gap-3">
        {fields.map((spec) => (
          <div
            key={spec.key}
            className={
              spec.kind === "text" || spec.key === "name" ? "col-span-2 space-y-1.5" : "space-y-1.5"
            }
          >
            <Label htmlFor={`${draft.id}-${spec.key}`}>{spec.label}</Label>
            <FieldInput
              id={`${draft.id}-${spec.key}`}
              spec={spec}
              value={draft.fields[spec.key]}
              reference={reference}
              onChange={(v) => onFieldChange(draft.id, spec.key, v)}
            />
          </div>
        ))}
      </div>

      {draft.warnings.length > 0 && (
        <div className="space-y-1">
          {draft.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {draft.commitError && <p className="text-xs text-negative">{draft.commitError}</p>}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={draft.committing || (!!targetKind && !draft.targetId)}
          onClick={() => onCommitOne(draft.id)}
        >
          {draft.committing ? COMMITTING_LABEL[draft.actionLabel] : draft.actionLabel}
        </Button>
      </div>
    </div>
  );
}

function TargetPicker({
  draft,
  targetKind,
  reference,
  onTargetChange,
}: {
  draft: DraftItemState;
  targetKind: TargetKind;
  reference: SmartEntryReference;
  onTargetChange: (id: string, targetId: string, targetLabel: string | undefined) => void;
}) {
  const pool = reference[`${targetKind}s`];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${draft.id}-target`}>{targetLabelFor(targetKind)}</Label>
      <Select
        id={`${draft.id}-target`}
        value={draft.targetId ?? ""}
        onChange={(e) => {
          const opt = pool.find((o) => o.id === e.target.value);
          onTargetChange(draft.id, e.target.value, opt?.name);
        }}
      >
        <option value="">Select…</option>
        {pool.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function targetLabelFor(kind: TargetKind): string {
  switch (kind) {
    case "investment":
      return "Investment";
    case "loan":
      return "Loan";
    case "goal":
      return "Goal";
    case "budget":
      return "Budget";
    case "recurringRule":
      return "Recurring rule";
    case "transaction":
      return "Transaction";
    case "collection":
      return "Collection";
  }
}

function FieldInput({
  id,
  spec,
  value,
  reference,
  onChange,
}: {
  id: string;
  spec: (typeof FIELD_SPECS)[string][number];
  value: unknown;
  reference: SmartEntryReference;
  onChange: (value: string) => void;
}) {
  const str = value == null ? "" : String(value);

  if (spec.kind === "amount") {
    return (
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={str}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (spec.kind === "date") {
    return <Input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value)} />;
  }
  if (spec.kind === "text") {
    return <Input id={id} type="text" value={str} onChange={(e) => onChange(e.target.value)} />;
  }

  // select
  const options =
    spec.selectSource === "enum"
      ? (spec.enumOptions ?? []).map((o) => ({ id: o, name: labelize(o) }))
      : spec.selectSource === "expenseCategory"
        ? reference.expenseCategories
        : spec.selectSource === "incomeCategory"
          ? reference.incomeCategories
          : reference.accounts;
  const placeholder =
    spec.selectSource === "expenseCategory" || spec.selectSource === "incomeCategory"
      ? "Uncategorized"
      : spec.selectSource === "account"
        ? "None"
        : "—";

  return (
    <Select id={id} value={str} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}

function labelize(v: string): string {
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
