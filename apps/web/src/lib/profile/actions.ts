"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { CURRENCY_CODES } from "@/lib/format";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name").max(80),
  baseCurrency: z.enum(CURRENCY_CODES),
});

/** Update the signed-in user's display name and base currency. */
export async function updateProfile(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in first." };

  // The profile row is created on signup; upsert keeps this resilient.
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: parsed.data.fullName,
    base_currency: parsed.data.baseCurrency,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
