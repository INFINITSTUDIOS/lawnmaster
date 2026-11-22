import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

let client: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses row-level security, so every query made with it
 * must be scoped explicitly (by company id, customer id, ...). Server only.
 */
export function createAdminClient(): SupabaseClient {
  if (client) return client;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  client = createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
