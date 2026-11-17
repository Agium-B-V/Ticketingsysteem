// Gedeelde Deno-code voor de beheer-Edge Functions: CORS, antwoorden en de
// controle van de aanroeper. Logt nooit wachtwoorden of verzoekinhoud.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { parseOrigins } from '../logic/validatie.ts';

export type Json = Record<string, unknown>;

export interface Context {
  body: Json;
  callerId: string;
  admin: SupabaseClient;
}

const BASIS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin',
};

function corsHeaders(origin: string | null): { toegestaan: boolean; headers: Record<string, string> } {
  if (!origin) return { toegestaan: true, headers: { ...BASIS_HEADERS } };
  const toegestaan = parseOrigins(Deno.env.get('ALLOWED_ORIGINS')).includes(origin);
  if (!toegestaan) return { toegestaan: false, headers: { ...BASIS_HEADERS } };
  return {
    toegestaan: true,
    headers: {
      ...BASIS_HEADERS,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
    },
  };
}

function antwoord(status: number, data: Json, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers });
}

function omgeving(naam: string): string {
  const v = Deno.env.get(naam);
  if (!v) throw new ConfiguratieFout(naam);
  return v;
}

class ConfiguratieFout extends Error {
  constructor(public variabele: string) {
    super(`Omgevingsvariabele ${variabele} ontbreekt`);
  }
}

export class InvoerFout extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Fout zonder gevoelige details naar de log. */
function logFout(functie: string, err: unknown) {
  const naam = err instanceof Error ? err.name : 'onbekend';
  const code = (err as { code?: unknown })?.code;
  console.error(`[${functie}] onverwachte fout: ${naam}${code ? ` (${String(code)})` : ''}`);
}

/**
 * Verifieert de JWT van de aanroeper bij Supabase Auth en controleert via de
 * database (RLS-context van de aanroeper) dat die IT-admin is.
 */
async function controleerAanroeper(
  req: Request,
): Promise<{ ok: true; callerId: string } | { ok: false; status: number; fout: string }> {
  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return { ok: false, status: 401, fout: 'Niet ingelogd' };
  const token = match[1]!;

  const gebruikerClient = createClient(omgeving('SUPABASE_URL'), omgeving('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await gebruikerClient.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, fout: 'Niet ingelogd' };

  const { data: isAdmin, error: rpcFout } = await gebruikerClient.rpc('is_it_admin');
  if (rpcFout || isAdmin !== true) return { ok: false, status: 403, fout: 'Geen toegang' };

  return { ok: true, callerId: data.user.id };
}

/** Bouwt een Deno.serve-handler met CORS, methodecontrole en autorisatie. */
export function beheerFunctie(naam: string, verwerk: (ctx: Context) => Promise<Json>) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req.headers.get('Origin'));
    if (!cors.toegestaan) return antwoord(403, { fout: 'Origin niet toegestaan' }, cors.headers);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    if (req.method !== 'POST') return antwoord(405, { fout: 'Methode niet toegestaan' }, cors.headers);

    try {
      const aanroeper = await controleerAanroeper(req);
      if (!aanroeper.ok) return antwoord(aanroeper.status, { fout: aanroeper.fout }, cors.headers);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return antwoord(400, { fout: 'Ongeldige JSON' }, cors.headers);
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return antwoord(400, { fout: 'Ongeldige invoer' }, cors.headers);
      }

      const admin = createClient(omgeving('SUPABASE_URL'), omgeving('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const data = await verwerk({ body: body as Json, callerId: aanroeper.callerId, admin });
      return antwoord(200, data, cors.headers);
    } catch (err) {
      if (err instanceof InvoerFout) return antwoord(err.status, { fout: err.message }, cors.headers);
      if (err instanceof ConfiguratieFout) {
        console.error(`[${naam}] configuratie ontbreekt: ${err.variabele}`);
        return antwoord(500, { fout: 'De functie is niet volledig ingesteld' }, cors.headers);
      }
      logFout(naam, err);
      return antwoord(500, { fout: 'Er ging iets mis' }, cors.headers);
    }
  };
}

export function toegestaneDomeinen(): string {
  return Deno.env.get('ALLOWED_EMAIL_DOMAINS') ?? '';
}
