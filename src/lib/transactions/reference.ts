import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TransactionKind } from "./types";

export interface CategoryOption {
  id: string;
  name: string;
  kind: TransactionKind;
  icon: string | null;
}

export interface AccountOption {
  id: string;
  name: string;
}

/** System + user categories, scoped by RLS. */
export async function getCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, icon")
    .is("deleted_at", null)
    .order("name");

  return (data ?? []) as CategoryOption[];
}

/** The user's accounts, scoped by RLS. */
export async function getAccounts(): Promise<AccountOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, name")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");

  return (data ?? []) as AccountOption[];
}
