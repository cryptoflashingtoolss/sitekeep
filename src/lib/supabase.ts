import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const LS_KEY = 'sitekeep.supabase';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Connection details come from the setup screen (saved locally) or from .env at build time. */
export function getConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const c = JSON.parse(raw) as SupabaseConfig;
      if (c.url && c.anonKey) return c;
    }
  } catch {
    /* ignore */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export function saveConfig(c: SupabaseConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify({ url: c.url.trim().replace(/\/+$/, ''), anonKey: c.anonKey.trim() }));
  client = null;
}

export function clearConfig(): void {
  localStorage.removeItem(LS_KEY);
  client = null;
}

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    const c = getConfig();
    if (!c) throw new Error('Supabase is not configured');
    client = createClient(c.url, c.anonKey, {
      // Never keep a session on disk: you log in each time you open the app.
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}
