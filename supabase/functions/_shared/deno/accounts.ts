// Aanmaken en wijzigen van accounts met de service-role client.
// Bij een fout halverwege wordt het Auth-account weer verwijderd, zodat er
// geen half aangemaakte gebruikers achterblijven.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { genereerWachtwoord } from '../logic/wachtwoord.ts';
import type { Lidmaatschap } from '../logic/validatie.ts';
import { InvoerFout } from './beheer.ts';

export interface NieuwAccount {
  email: string;
  full_name: string;
  memberships: Lidmaatschap[];
}

export interface AangemaaktAccount {
  user_id: string;
  email: string;
  temp_password: string;
}

const BESTAAT_AL = /already (been )?registered|already exists|email_exists/i;

/** Controleert dat alle teams bestaan. */
export async function controleerTeams(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await admin.from('teams').select('id').in('id', ids);
  if (error) throw error;
  if ((data ?? []).length !== new Set(ids).size) throw new InvoerFout('Een of meer teams bestaan niet');
}

export async function maakAccount(admin: SupabaseClient, invoer: NieuwAccount): Promise<AangemaaktAccount> {
  const wachtwoord = genereerWachtwoord();

  const { data, error } = await admin.auth.admin.createUser({
    email: invoer.email,
    password: wachtwoord,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error && (BESTAAT_AL.test(error.message) || (error as { code?: string }).code === 'email_exists')) {
      throw new InvoerFout('Er bestaat al een account met dit e-mailadres', 409);
    }
    throw error ?? new Error('Aanmaken mislukt');
  }
  const userId = data.user.id;

  try {
    const { error: profielFout } = await admin.from('profiles').insert({
      id: userId,
      full_name: invoer.full_name,
      email: invoer.email,
      active: true,
      must_change_password: true,
    });
    if (profielFout) throw profielFout;

    if (invoer.memberships.length > 0) {
      const { error: lidFout } = await admin
        .from('team_members')
        .insert(invoer.memberships.map((m) => ({ team_id: m.team_id, user_id: userId, role: m.role })));
      if (lidFout) throw lidFout;
    }

    const { error: snapFout } = await admin.rpc('admin_snapshot_password', { p_user_id: userId });
    if (snapFout) throw snapFout;
  } catch (err) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw err;
  }

  return { user_id: userId, email: invoer.email, temp_password: wachtwoord };
}

export async function bestaatProfiel(admin: SupabaseClient, userId: string): Promise<{ email: string; active: boolean }> {
  const { data, error } = await admin.from('profiles').select('email, active').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new InvoerFout('Gebruiker niet gevonden', 404);
  return data as { email: string; active: boolean };
}

export async function zetTijdelijkWachtwoord(admin: SupabaseClient, userId: string): Promise<string> {
  // Eerst must_change_password aan: mislukt een latere stap, dan heeft het
  // (eventueel al gewijzigde) wachtwoord nog geen toegang tot gegevens.
  const { error: profielFout } = await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  if (profielFout) throw profielFout;
  const wachtwoord = genereerWachtwoord();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: wachtwoord });
  if (error) throw error;
  const { error: snapFout } = await admin.rpc('admin_snapshot_password', { p_user_id: userId });
  if (snapFout) throw snapFout;
  return wachtwoord;
}
