export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          period: Database["public"]["Enums"]["budget_period"]
          starts_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          period?: Database["public"]["Enums"]["budget_period"]
          starts_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          period?: Database["public"]["Enums"]["budget_period"]
          starts_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          icon: string | null
          id: string
          is_system: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          frequency: Database["public"]["Enums"]["frequency"]
          id: string
          is_recurring: boolean
          next_date: string | null
          note: string | null
          spent_at: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["frequency"]
          id?: string
          is_recurring?: boolean
          next_date?: string | null
          note?: string | null
          spent_at: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["frequency"]
          id?: string
          is_recurring?: boolean
          next_date?: string | null
          note?: string | null
          spent_at?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_accounts_id_fk"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount: number
          contributed_at: string
          created_at: string
          deleted_at: string | null
          goal_id: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          contributed_at: string
          created_at?: string
          deleted_at?: string | null
          goal_id: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          contributed_at?: string
          created_at?: string
          deleted_at?: string | null
          goal_id?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_goals_id_fk"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          currency: string
          current_amount: number
          deadline: string | null
          deleted_at: string | null
          icon: string | null
          id: string
          monthly_contribution: number | null
          name: string
          priority: Database["public"]["Enums"]["goal_priority"]
          status: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          current_amount?: number
          deadline?: string | null
          deleted_at?: string | null
          icon?: string | null
          id?: string
          monthly_contribution?: number | null
          name: string
          priority?: Database["public"]["Enums"]["goal_priority"]
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          current_amount?: number
          deadline?: string | null
          deleted_at?: string | null
          icon?: string | null
          id?: string
          monthly_contribution?: number | null
          name?: string
          priority?: Database["public"]["Enums"]["goal_priority"]
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          frequency: Database["public"]["Enums"]["frequency"]
          id: string
          is_recurring: boolean
          next_date: string | null
          received_at: string
          source_type: Database["public"]["Enums"]["income_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["frequency"]
          id?: string
          is_recurring?: boolean
          next_date?: string | null
          received_at: string
          source_type?: Database["public"]["Enums"]["income_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["frequency"]
          id?: string
          is_recurring?: boolean
          next_date?: string | null
          received_at?: string
          source_type?: Database["public"]["Enums"]["income_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_account_id_accounts_id_fk"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_category_id_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          id: string
          interest_component: number | null
          is_extra: boolean
          loan_id: string
          paid_on: string
          principal_component: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          interest_component?: number | null
          is_extra?: boolean
          loan_id: string
          paid_on: string
          principal_component?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          interest_component?: number | null
          is_extra?: boolean
          loan_id?: string
          paid_on?: string
          principal_component?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_loans_id_fk"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          created_at: string
          currency: string
          deleted_at: string | null
          emi: number
          extra_emi: number | null
          id: string
          interest_rate: number
          name: string
          principal: number
          remaining_amount: number
          remaining_months: number | null
          start_date: string
          type: Database["public"]["Enums"]["loan_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          emi?: number
          extra_emi?: number | null
          id?: string
          interest_rate?: number
          name: string
          principal: number
          remaining_amount: number
          remaining_months?: number | null
          start_date: string
          type?: Database["public"]["Enums"]["loan_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          deleted_at?: string | null
          emi?: number
          extra_emi?: number | null
          id?: string
          interest_rate?: number
          name?: string
          principal?: number
          remaining_amount?: number
          remaining_months?: number | null
          start_date?: string
          type?: Database["public"]["Enums"]["loan_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_currency: string
          created_at: string
          deleted_at: string | null
          full_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          base_currency?: string
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          base_currency?: string
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_type:
        | "cash"
        | "bank"
        | "credit_card"
        | "wallet"
        | "investment"
        | "other"
      budget_period: "weekly" | "monthly" | "yearly"
      category_kind: "income" | "expense"
      frequency:
        | "one_time"
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      goal_priority: "low" | "medium" | "high"
      goal_status: "active" | "paused" | "completed" | "cancelled"
      income_type:
        | "salary"
        | "freelance"
        | "rental"
        | "interest"
        | "business"
        | "dividend"
        | "other"
      loan_type:
        | "home"
        | "car"
        | "personal"
        | "education"
        | "credit_card"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "cash",
        "bank",
        "credit_card",
        "wallet",
        "investment",
        "other",
      ],
      budget_period: ["weekly", "monthly", "yearly"],
      category_kind: ["income", "expense"],
      frequency: [
        "one_time",
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      goal_priority: ["low", "medium", "high"],
      goal_status: ["active", "paused", "completed", "cancelled"],
      income_type: [
        "salary",
        "freelance",
        "rental",
        "interest",
        "business",
        "dividend",
        "other",
      ],
      loan_type: [
        "home",
        "car",
        "personal",
        "education",
        "credit_card",
        "other",
      ],
    },
  },
} as const
