import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BACKEND_URL = "https://pvtsykqjpschiexxprth.supabase.co";
const BACKEND_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dHN5a3FqcHNjaGlleHhwcnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA5MzYsImV4cCI6MjA5MTI5NjkzNn0.tZy0OwV0_969R5SgG7jLIajYp3e2TKPEY7IIPgkhElo";

let clientPromise: Promise<SupabaseClient<Database>> | null = null;

export function getFunctionUrl(name: string) {
  return `${BACKEND_URL}/functions/v1/${name}`;
}

export async function getCloudClient(): Promise<SupabaseClient<Database>> {
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient<Database>(BACKEND_URL, BACKEND_PUBLISHABLE_KEY, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    }),
  );

  return clientPromise;
}