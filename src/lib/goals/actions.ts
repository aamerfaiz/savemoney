"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { goalInputSchema, contributionInputSchema } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUser() {
  if (!isSupabaseConfigured()) {
    return { error: "Connect Supabase (set env vars) to save goals." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

export async function createGoal(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = goalInputSchema.safeParse({
    name: formData.get("name"),
    icon: emptyToNull(formData.get("icon")),
    targetAmount: formData.get("targetAmount"),
    currentAmount: formData.get("currentAmount") || 0,
    currency: formData.get("currency") || "USD",
    deadline: emptyToNull(formData.get("deadline")),
    priority: formData.get("priority") || "medium",
    monthlyContribution: emptyToNull(formData.get("monthlyContribution")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const { error } = await supabase.from("goals").insert({
    user_id: userId,
    name: v.name,
    icon: v.icon ?? null,
    target_amount: v.targetAmount,
    current_amount: v.currentAmount,
    currency,
    deadline: v.deadline ?? null,
    priority: v.priority,
    monthly_contribution: v.monthlyContribution ?? null,
    status: v.currentAmount >= v.targetAmount ? "completed" : "active",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateGoal(
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = goalInputSchema.safeParse({
    name: formData.get("name"),
    icon: emptyToNull(formData.get("icon")),
    targetAmount: formData.get("targetAmount"),
    currentAmount: formData.get("currentAmount") || 0,
    currency: formData.get("currency") || "USD",
    deadline: emptyToNull(formData.get("deadline")),
    priority: formData.get("priority") || "medium",
    monthlyContribution: emptyToNull(formData.get("monthlyContribution")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const { error } = await supabase
    .from("goals")
    .update({
      name: v.name,
      icon: v.icon ?? null,
      target_amount: v.targetAmount,
      current_amount: v.currentAmount,
      currency: v.currency,
      deadline: v.deadline ?? null,
      priority: v.priority,
      monthly_contribution: v.monthlyContribution ?? null,
      status: v.currentAmount >= v.targetAmount ? "completed" : "active",
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("goals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Record a contribution and advance the goal's saved amount. */
export async function addContribution(
  goalId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributionInputSchema.safeParse({
    amount: formData.get("amount"),
    contributedAt:
      formData.get("contributedAt") || new Date().toISOString().slice(0, 10),
    note: emptyToNull(formData.get("note")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  // Read the goal (RLS-scoped) to compute the new saved amount + status.
  const { data: goal, error: readErr } = await supabase
    .from("goals")
    .select("current_amount, target_amount")
    .eq("id", goalId)
    .single();
  if (readErr || !goal) {
    return { ok: false, error: readErr?.message ?? "Goal not found." };
  }

  const { error: insErr } = await supabase.from("goal_contributions").insert({
    goal_id: goalId,
    user_id: userId,
    amount: v.amount,
    contributed_at: v.contributedAt,
    note: v.note ?? null,
  });
  if (insErr) return { ok: false, error: insErr.message };

  const newAmount = Number(goal.current_amount) + v.amount;
  const { error: updErr } = await supabase
    .from("goals")
    .update({
      current_amount: newAmount,
      status: newAmount >= Number(goal.target_amount) ? "completed" : "active",
    })
    .eq("id", goalId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return { ok: true };
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function fieldErrors(err: import("zod").ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}
