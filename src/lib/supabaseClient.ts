/**
 * Persistent Supabase client wrapper.
 *
 * The auto-generated client at `src/integrations/supabase/client.ts` uses
 * `sessionStorage`, which causes sessions (incl. MFA state) to be lost
 * when the browser tab is closed.
 *
 * This module re-exports a client configured with `localStorage` so that
 * sessions survive tab/browser restarts.  All application code should
 * import from here instead of the auto-generated file.
 *
 * The auto-generated client is intentionally NOT modified — it may be
 * overwritten at any time by the Lovable platform.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
