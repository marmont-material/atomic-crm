import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type {
  BounceRow,
  SendLogRow,
  StgCompany,
  StgContact,
  Supplier,
  SupplierRule,
} from "./outreachLogic";

export type EmailFormat = {
  id: number;
  domain: string;
  best_guess: string | null;
  confidence: string | null;
  accepted: string | null;
  bounced: string | null;
};

export type OutreachData = {
  companies: StgCompany[];
  contacts: StgContact[];
  bounces: BounceRow[];
  rules: SupplierRule[];
  suppliers: Supplier[];
  sendLog: SendLogRow[];
  formats: EmailFormat[];
};

const TABLES = {
  companies: "stg_uk_companies",
  contacts: "stg_uk_contacts",
  bounces: "bounce_log",
  rules: "supplier_rules",
  suppliers: "suppliers",
  sendLog: "send_log",
  formats: "email_formats",
} as const;

export const useOutreachData = () => {
  const [data, setData] = useState<OutreachData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabaseClient();
    try {
      const entries = await Promise.all(
        Object.entries(TABLES).map(async ([key, table]) => {
          const { data: rows, error: queryError } = await supabase
            .from(table)
            .select("*")
            .range(0, 4999);
          if (queryError) throw new Error(`${table}: ${queryError.message}`);
          return [key, rows ?? []] as const;
        }),
      );
      setData(Object.fromEntries(entries) as unknown as OutreachData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
};

/** The CRM user id that tasks and notes are attributed to. */
export const getSalesId = async (): Promise<number | null> => {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("sales")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return data?.id ?? null;
};
