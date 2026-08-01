"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { GOAL_PRIORITIES, GOAL_STATUSES } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * What the server actually validates now (Phase 3.5.4): shape only, for the
 * fields that stay plaintext. `targetAmount`/`currentAmount`/
 * `monthlyContribution` arrive as already-packed ciphertext — the client
 * validated the real values (positive, within range) *before* encrypting,
 * via the same `goalInputSchema` it always used. `status` is derived
 * client-side too (`currentAmount >= targetAmount`), since the server can no
 * longer compare two ciphertext amounts. See
 * src/lib/goals/client-actions.ts, which builds this input.
 */
const encryptedGoalInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().max(40).optional().nullable(),
  targetAmount: z.string().min(1),
  currentAmount: z.string().min(1),
  currency: z.string().length(3),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  priority: z.enum(GOAL_PRIORITIES),
  monthlyContribution: z.string().min(1).optional().nullable(),
  status: z.enum(GOAL_STATUSES),
});

export type EncryptedGoalInput = z.infer<typeof encryptedGoalInputSchema>;

/** `goal_contributions.amount` is encrypted as of Phase 3.5.4, same as the
 * running `goals.current_amount` balance it feeds. Because that balance is
 * ciphertext, the server can no longer read-modify-write it (add this
 * contribution to whatever's currently stored): the client computes the
 * new total from its own already-decrypted `current_amount`, encrypts both
 * the contribution amount and the new total, and sends the derived status
 * directly. This trades the database's atomic increment for a
 * client-computed one — two concurrent contributions from the same user
 * (e.g. two open tabs) could race and one could clobber the other's
 * update. Accepted for a single-user app; see docs/e2ee-path-b-plan.md
 * 3.5.4. */
const encryptedContributionInputSchema = z.object({
  amount: z.string().min(1),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional().nullable(),
  newCurrentAmount: z.string().min(1),
  newStatus: z.enum(GOAL_STATUSES),
});

export type EncryptedContributionInput = z.infer<typeof encryptedContributionInputSchema>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

export async function createGoal(input: EncryptedGoalInput): Promise<ActionResult> {
  const parsed = encryptedGoalInputSchema.safeParse(input);
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
    status: v.status,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  return { ok: true };
}

export async function updateGoal(id: string, input: EncryptedGoalInput): Promise<ActionResult> {
  const parsed = encryptedGoalInputSchema.safeParse(input);
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
      status: v.status,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
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
  revalidatePath("/analytics");
  revalidatePath("/transactions"); // its contributions leave the transfer feed
  return { ok: true };
}

/** Record a contribution and advance the goal's saved amount. The new
 * `current_amount`/`status` arrive pre-computed and pre-encrypted (see the
 * schema comment above) — this just persists both writes. */
export async function addContribution(
  goalId: string,
  input: EncryptedContributionInput,
): Promise<ActionResult> {
  const parsed = encryptedContributionInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { error: insErr } = await supabase.from("goal_contributions").insert({
    goal_id: goalId,
    user_id: userId,
    amount: v.amount,
    contributed_at: v.contributedAt,
    note: v.note ?? null,
  });
  if (insErr) return { ok: false, error: insErr.message };

  const { error: updErr } = await supabase
    .from("goals")
    .update({
      current_amount: v.newCurrentAmount,
      status: v.newStatus,
    })
    .eq("id", goalId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/transactions"); // the contribution shows as a transfer row
  return { ok: true };
}

function fieldErrors(err: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}
