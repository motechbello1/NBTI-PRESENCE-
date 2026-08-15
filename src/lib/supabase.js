import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

// Keep imports safe even if a deployment is misconfigured. main.jsx replaces
// the application with a configuration notice, while these inert fallbacks
// prevent createClient from crashing before React can render that notice.
const clientUrl = url || "http://127.0.0.1:54321";
const clientKey = key || "missing-publishable-key";

export const supabase = createClient(clientUrl, clientKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
