/**
 * Server-side load/save for scheduler settings (service-role Supabase).
 * Keep this out of client bundles — import `settings.ts` there instead.
 */

import { supabase } from "@/lib/flow/supabase";
import { EmailSettings, withDefaults } from "./settings";

export async function getSettings(): Promise<EmailSettings> {
  const { data } = await supabase.from("email_settings").select("settings").eq("id", "default").maybeSingle();
  return withDefaults((data?.settings as Partial<EmailSettings>) || null);
}

export async function saveSettings(next: Partial<EmailSettings>): Promise<EmailSettings> {
  const merged = withDefaults({ ...(await getSettings()), ...next });
  const { error } = await supabase
    .from("email_settings")
    .upsert({ id: "default", settings: merged, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
  return merged;
}
