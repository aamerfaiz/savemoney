import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { toCurrencyCode, type CurrencyCode } from "@/lib/format";

export interface UserProfile {
  name: string;
  email: string | null;
  baseCurrency: CurrencyCode;
  /** True only when a real, authenticated profile was loaded. */
  isReal: boolean;
}

const GUEST: UserProfile = {
  name: "there",
  email: null,
  baseCurrency: "USD",
  isReal: false,
};

/**
 * The signed-in user's profile (name + base currency). The middleware guards
 * every route this is called from, so `user` is only ever null defensively.
 */
export const getProfile = cache(async (): Promise<UserProfile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return GUEST;

  const { data } = await supabase
    .from("profiles")
    .select("full_name, base_currency")
    .eq("id", user.id)
    .single();

  const name =
    data?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "there";

  return {
    name,
    email: user.email ?? null,
    baseCurrency: toCurrencyCode(data?.base_currency),
    isReal: true,
  };
});

/**
 * The user's base currency for display across the app. Memoized per request
 * (via getProfile's cache) so calling it from every page adds no extra query.
 */
export async function getDisplayCurrency(): Promise<CurrencyCode> {
  return (await getProfile()).baseCurrency;
}

/**
 * The user's base currency, for stamping newly-created rows. Takes an existing
 * client so create actions don't spin up a second one.
 */
export async function baseCurrencyFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<CurrencyCode> {
  const { data } = await supabase
    .from("profiles")
    .select("base_currency")
    .eq("id", userId)
    .single();
  return toCurrencyCode(data?.base_currency);
}
