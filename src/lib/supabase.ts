import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configuratieCompleet = Boolean(url && anonKey);

// Alleen de publieke anon key. De service-role key hoort nooit in de frontend.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'ontbreekt', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'agium-ticketing-auth',
  },
});

/** Gooit de fout van een Supabase-antwoord, anders de data. */
export function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
