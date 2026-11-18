import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Roept een beheer-Edge Function aan met het token van de ingelogde gebruiker. */
export async function roepFunctieAan<T>(naam: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(naam, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let melding = '';
      try {
        const json = (await error.context.json()) as { fout?: string };
        melding = json.fout ?? '';
      } catch {
        /* geen JSON */
      }
      const status = (error.context as Response).status;
      if (status === 401) throw new Error('Je sessie is verlopen. Log opnieuw in.');
      if (status === 403) throw new Error(melding || 'Je hebt hiervoor geen rechten.');
      throw new Error(melding || 'De actie is mislukt.');
    }
    throw new Error('De beheerfunctie is niet bereikbaar.');
  }
  return data as T;
}

export interface AangemaaktAccount {
  user_id: string;
  email: string;
  temp_password: string;
}

export interface BulkResultaat {
  resultaten: { regel: number; email: string; ok: boolean; reden?: string; temp_password?: string }[];
  gelukt: number;
  mislukt: number;
}
