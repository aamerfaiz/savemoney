import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

const DEMO_CATEGORIES: CategoryOption[] = [
  { id: "demo-groceries", name: "Groceries", kind: "expense", icon: "shopping-cart" },
  { id: "demo-food", name: "Food", kind: "expense", icon: "utensils" },
  { id: "demo-rent", name: "Rent", kind: "expense", icon: "home" },
  { id: "demo-fuel", name: "Fuel", kind: "expense", icon: "fuel" },
  { id: "demo-entertainment", name: "Entertainment", kind: "expense", icon: "clapperboard" },
  { id: "demo-salary", name: "Salary", kind: "income", icon: "wallet" },
  { id: "demo-freelance", name: "Freelance", kind: "income", icon: "laptop" },
  { id: "demo-dividend", name: "Dividend", kind: "income", icon: "coins" },
];

/** System + user categories, scoped by RLS. Demo list when unconfigured. */
export async function getCategories(): Promise<CategoryOption[]> {
  if (!isSupabaseConfigured()) return DEMO_CATEGORIES;

  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, icon")
    .is("deleted_at", null)
    .order("name");

  return (data ?? []) as CategoryOption[];
}

/** The user's accounts, scoped by RLS. Empty in demo mode. */
export async function getAccounts(): Promise<AccountOption[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("id, name")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");

  return (data ?? []) as AccountOption[];
}
