// Testset via de echte Supabase-API: REST (PostgREST), Realtime en de Edge
// Functions. Draait alleen tegen een LOKALE Supabase (supabase start), in CI.
// Gebruikt de lokale demo-sleutels uit `supabase status`, nooit productie.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FUNCTIES = process.env.SUPABASE_FUNCTIONS_URL ?? `${URL_}/functions/v1`;
const TOEGESTANE_ORIGIN = 'http://localhost:5173';

if (!URL_ || !ANON || !SERVICE) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY en SUPABASE_SERVICE_ROLE_KEY (lokaal) zijn vereist.');
}
if (!['127.0.0.1', 'localhost'].includes(new URL(URL_).hostname)) {
  throw new Error('De API-testset draait alleen tegen een lokale Supabase.');
}

const opties = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const service = createClient(URL_, SERVICE, opties);
const run = randomUUID().slice(0, 8);
const WACHTWOORD = `Test-wachtwoord-${run}-Aa1!`;

interface Gebruiker {
  id: string;
  email: string;
  client: SupabaseClient;
  token: string;
}

async function teamId(prefix: string): Promise<string> {
  const { data, error } = await service.from('teams').select('id').eq('prefix', prefix).single();
  if (error) throw error;
  return data.id as string;
}

async function maakGebruiker(sleutel: string, rollen: { team: string; rol: 'handler' | 'admin' }[] = []): Promise<Gebruiker> {
  const email = `test.${sleutel}.${run}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, password: WACHTWOORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser');
  const id = data.user.id;
  const p = await service.from('profiles').insert({ id, email, full_name: `Test ${sleutel}`, must_change_password: false });
  if (p.error) throw p.error;
  for (const r of rollen) {
    const m = await service.from('team_members').insert({ team_id: r.team, user_id: id, role: r.rol });
    if (m.error) throw m.error;
  }
  return login(email, WACHTWOORD, id);
}

async function login(email: string, wachtwoord: string, id?: string): Promise<Gebruiker> {
  const client = createClient(URL_, ANON, opties);
  const { data, error } = await client.auth.signInWithPassword({ email, password: wachtwoord });
  if (error || !data.session) throw error ?? new Error('login');
  return { id: id ?? data.user.id, email, client, token: data.session.access_token };
}

async function roepAan(functie: string, body: unknown, token?: string, origin?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: ANON };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${FUNCTIES}/${functie}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const tekst = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(tekst) as Record<string, unknown>;
  } catch {
    /* geen JSON */
  }
  return { status: res.status, json, headers: res.headers };
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

let FIN: string;
let IT: string;
let A: Gebruiker;
let B: Gebruiker;
let finHandler: Gebruiker;
let itAdmin: Gebruiker;
let finAdmin: Gebruiker;
let bVertrouwelijk: { id: string; number: string };
let bOpenbaar: { id: string; number: string };

beforeAll(async () => {
  FIN = await teamId('FIN');
  IT = await teamId('IT');
  A = await maakGebruiker('medewerker.a');
  B = await maakGebruiker('medewerker.b');
  finHandler = await maakGebruiker('handler.finance', [{ team: FIN, rol: 'handler' }]);
  itAdmin = await maakGebruiker('admin.it', [{ team: IT, rol: 'admin' }]);
  finAdmin = await maakGebruiker('admin.finance', [{ team: FIN, rol: 'admin' }]);

  const v = await B.client
    .from('tickets')
    .insert({ team_id: FIN, submitter_name: 'Test B', subject: `Geheim ${run}`, description: 'Vertrouwelijk', confidential: true })
    .select('id, number')
    .single();
  if (v.error) throw v.error;
  bVertrouwelijk = v.data;
  const o = await B.client
    .from('tickets')
    .insert({ team_id: FIN, submitter_name: 'Test B', subject: `Openbaar ${run}`, description: 'Openbaar' })
    .select('id, number')
    .single();
  if (o.error) throw o.error;
  bOpenbaar = o.data;
});

afterAll(async () => {
  for (const g of [A, B, finHandler, itAdmin, finAdmin]) await g?.client.removeAllChannels();
});

describe('REST zonder inlog (anon key)', () => {
  it('kan geen tabel of view lezen', async () => {
    const anon = createClient(URL_, ANON, opties);
    for (const t of ['teams', 'profiles', 'team_members', 'tickets', 'ticket_comments', 'ticket_counts']) {
      const { data, error } = await anon.from(t).select('id').limit(1);
      expect(error, t).not.toBeNull();
      expect(data, t).toBeNull();
    }
  });

  it('kan niet schrijven of functies aanroepen', async () => {
    const anon = createClient(URL_, ANON, opties);
    const ins = await anon.from('tickets').insert({ team_id: FIN, submitter_id: A.id, submitter_name: 'x', subject: 'x', description: 'x' });
    expect(ins.error).not.toBeNull();
    for (const f of ['is_it_admin', 'has_access', 'is_active', 'mark_password_changed']) {
      const { error } = await anon.rpc(f);
      expect(error, f).not.toBeNull();
    }
  });
});

describe('REST met het token van medewerker A', () => {
  it('ziet het vertrouwelijke ticket van B niet: lijst, id, nummer, zoeken en tellingen', async () => {
    const lijst = await A.client.from('tickets').select('id');
    expect(lijst.error).toBeNull();
    expect(lijst.data!.map((r) => r.id)).not.toContain(bVertrouwelijk.id);

    const opId = await A.client.from('tickets').select('id').eq('id', bVertrouwelijk.id);
    expect(opId.data).toEqual([]);

    const opNummer = await A.client.from('tickets').select('id').eq('number', bVertrouwelijk.number);
    expect(opNummer.data).toEqual([]);

    const zoek = await A.client.from('tickets').select('id').or(`subject.ilike.%Geheim ${run}%,description.ilike.%Vertrouwelijk%`);
    expect(zoek.data!.map((r) => r.id)).not.toContain(bVertrouwelijk.id);

    const telB = await A.client.from('tickets').select('id', { count: 'exact', head: true }).eq('submitter_id', B.id);
    expect(telB.count).toBe(1);

    const viaService = await service.from('tickets').select('id').eq('team_id', FIN);
    const viaA = await A.client.from('tickets').select('id', { count: 'exact', head: true }).eq('team_id', FIN);
    const view = await A.client.from('ticket_counts').select('aantal').eq('team_id', FIN);
    const somView = (view.data ?? []).reduce((s, r) => s + (r.aantal as number), 0);
    expect(somView).toBe(viaA.count);
    expect(viaA.count).toBeLessThan(viaService.data!.length);
  });

  it('ziet het openbare ticket van B, maar kan het niet wijzigen of annuleren', async () => {
    const zie = await A.client.from('tickets').select('id, status').eq('id', bOpenbaar.id).single();
    expect(zie.data?.status).toBe('open');
    await A.client.from('tickets').update({ status: 'afgerond' }).eq('id', bOpenbaar.id);
    await A.client.from('tickets').update({ status: 'geannuleerd' }).eq('id', bOpenbaar.id);
    const na = await service.from('tickets').select('status').eq('id', bOpenbaar.id).single();
    expect(na.data?.status).toBe('open');
  });

  it('kan geen ticket namens B indienen', async () => {
    const r = await A.client
      .from('tickets')
      .insert({ team_id: FIN, submitter_id: B.id, submitter_name: 'B', subject: 'Namens B', description: 'x' });
    expect(r.error).not.toBeNull();
  });

  it('kan de tellers van teams niet opvragen', async () => {
    const r = await A.client.from('teams').select('ticket_counter');
    expect(r.error).not.toBeNull();
  });

  it('ziet geen reacties op het openbare ticket van B', async () => {
    const h = await finHandler.client.from('ticket_comments').insert({ ticket_id: bOpenbaar.id, body: 'Reactie aan B' });
    expect(h.error).toBeNull();
    const r = await A.client.from('ticket_comments').select('id').eq('ticket_id', bOpenbaar.id);
    expect(r.data).toEqual([]);
    const rb = await B.client.from('ticket_comments').select('body').eq('ticket_id', bOpenbaar.id);
    expect(rb.data?.map((x) => x.body)).toEqual(['Reactie aan B']);
  });
});

describe('Realtime', () => {
  it('stuurt een nieuw vertrouwelijk ticket alleen naar wie het mag zien', async () => {
    const ontvangenA: string[] = [];
    const ontvangenH: string[] = [];
    const abonneer = (g: Gebruiker, lijst: string[]) =>
      new Promise<void>((klaar, fout) => {
        g.client.realtime.setAuth(g.token);
        g.client
          .channel(`tickets-${g.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (p) => {
            lijst.push((p.new as { id: string }).id);
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') klaar();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') fout(new Error(status));
          });
      });
    await Promise.all([abonneer(A, ontvangenA), abonneer(finHandler, ontvangenH)]);
    await wacht(1500);

    const geheim = await B.client
      .from('tickets')
      .insert({ team_id: FIN, submitter_name: 'Test B', subject: 'Realtime geheim', description: 'x', confidential: true })
      .select('id')
      .single();
    const openbaar = await B.client
      .from('tickets')
      .insert({ team_id: FIN, submitter_name: 'Test B', subject: 'Realtime openbaar', description: 'x' })
      .select('id')
      .single();

    for (let i = 0; i < 20 && !(ontvangenH.includes(geheim.data!.id) && ontvangenA.includes(openbaar.data!.id)); i++) {
      await wacht(500);
    }
    await wacht(1000);

    // Controle dat Realtime werkt: de handler krijgt beide, A krijgt het openbare.
    expect(ontvangenH).toContain(geheim.data!.id);
    expect(ontvangenA).toContain(openbaar.data!.id);
    // De eigenlijke test: A krijgt het vertrouwelijke ticket nooit.
    expect(ontvangenA).not.toContain(geheim.data!.id);
  });
});

const FUNCTIE_NAMEN = ['admin-create-user', 'admin-bulk-create-users', 'admin-reset-password', 'admin-set-active'];

describe('Edge Functions: autorisatie', () => {
  it.each(FUNCTIE_NAMEN)('%s geeft 401 zonder token', async (f) => {
    const r = await roepAan(f, {});
    expect(r.status).toBe(401);
  });

  it.each(FUNCTIE_NAMEN)('%s geeft 401 met alleen de anon key als token', async (f) => {
    const r = await roepAan(f, {}, ANON);
    expect(r.status).toBe(401);
  });

  it.each(FUNCTIE_NAMEN)('%s geeft 403 voor een gewone medewerker', async (f) => {
    const r = await roepAan(f, { email: `x.${run}@example.com`, full_name: 'X', users: [], user_id: B.id, active: false }, A.token);
    expect(r.status).toBe(403);
  });

  it.each(FUNCTIE_NAMEN)('%s geeft 403 voor een handler die geen IT-admin is', async (f) => {
    const r = await roepAan(f, { user_id: B.id, active: false }, finHandler.token);
    expect(r.status).toBe(403);
  });

  it.each(FUNCTIE_NAMEN)('%s geeft 403 voor een admin van een ander team dan IT', async (f) => {
    const r = await roepAan(f, { user_id: B.id, active: false }, finAdmin.token);
    expect(r.status).toBe(403);
  });

  it('weigert een niet-toegestane origin en staat de ingestelde origin toe', async () => {
    const fout = await roepAan('admin-create-user', {}, itAdmin.token, 'https://evil.example.org');
    expect(fout.status).toBe(403);
    expect(fout.headers.get('access-control-allow-origin')).toBeNull();

    const pre = await fetch(`${FUNCTIES}/admin-create-user`, {
      method: 'OPTIONS',
      headers: { Origin: TOEGESTANE_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(pre.headers.get('access-control-allow-origin')).toBe(TOEGESTANE_ORIGIN);
    await pre.text();
  });
});

describe('Edge Functions: accountbeheer door een IT-admin', () => {
  let nieuwId = '';
  let tijdelijk = '';
  const email = `test.nieuw.${run}@example.com`;

  it('weigert een e-mailadres buiten het bedrijfsdomein', async () => {
    const r = await roepAan('admin-create-user', { email: `x.${run}@gmail.com`, full_name: 'X' }, itAdmin.token);
    expect(r.status).toBe(400);
  });

  it('maakt een account aan met een sterk tijdelijk wachtwoord en teamrol', async () => {
    const r = await roepAan(
      'admin-create-user',
      { email, full_name: 'Test Nieuw', memberships: [{ team_id: FIN, role: 'handler' }] },
      itAdmin.token,
    );
    expect(r.status).toBe(200);
    nieuwId = r.json.user_id as string;
    tijdelijk = r.json.temp_password as string;
    expect(tijdelijk.length).toBeGreaterThanOrEqual(12);
    const p = await service.from('profiles').select('must_change_password, active').eq('id', nieuwId).single();
    expect(p.data).toEqual({ must_change_password: true, active: true });
    const dubbel = await roepAan('admin-create-user', { email, full_name: 'Test Nieuw' }, itAdmin.token);
    expect(dubbel.status).toBe(409);
  });

  it('met het tijdelijke wachtwoord krijg je geen tickets tot je het wijzigt', async () => {
    const g = await login(email, tijdelijk);
    const voor = await g.client.from('tickets').select('id');
    expect(voor.data).toEqual([]);
    const overslaan = await g.client.rpc('mark_password_changed');
    expect(overslaan.error).not.toBeNull();

    const upd = await g.client.auth.updateUser({ password: `Nieuw-${run}-wachtwoord-Bb2?` });
    expect(upd.error).toBeNull();
    const mark = await g.client.rpc('mark_password_changed');
    expect(mark.error).toBeNull();
    const na = await g.client.from('tickets').select('id');
    expect((na.data ?? []).length).toBeGreaterThan(0);
  });

  it('reset het wachtwoord: oude werkt niet meer, nieuwe tijdelijke wel, must_change_password weer aan', async () => {
    const r = await roepAan('admin-reset-password', { user_id: nieuwId }, itAdmin.token);
    expect(r.status).toBe(200);
    const nieuwTijdelijk = r.json.temp_password as string;
    await expect(login(email, `Nieuw-${run}-wachtwoord-Bb2?`)).rejects.toBeTruthy();
    const g = await login(email, nieuwTijdelijk);
    const p = await g.client.from('profiles').select('must_change_password').single();
    expect(p.data?.must_change_password).toBe(true);
  });

  it('deactiveert: een nog geldig token krijgt niets meer, inloggen lukt niet; heractiveren herstelt', async () => {
    const r0 = await roepAan('admin-reset-password', { user_id: nieuwId }, itAdmin.token);
    const g = await login(email, r0.json.temp_password as string);
    await g.client.auth.updateUser({ password: `Weer-${run}-anders-Cc3!` });
    await g.client.rpc('mark_password_changed');
    expect(((await g.client.from('tickets').select('id')).data ?? []).length).toBeGreaterThan(0);

    const uit = await roepAan('admin-set-active', { user_id: nieuwId, active: false }, itAdmin.token);
    expect(uit.status).toBe(200);
    for (const t of ['tickets', 'profiles', 'team_members', 'ticket_counts', 'ticket_comments']) {
      const r = await g.client.from(t).select('*');
      expect(r.data ?? [], t).toEqual([]);
    }
    const toegang = await g.client.rpc('has_access');
    expect(toegang.data).not.toBe(true);
    // De sessie is ingetrokken: verversen van het token lukt niet meer.
    const ververs = await g.client.auth.refreshSession();
    expect(ververs.error).not.toBeNull();
    const teams = await g.client.from('teams').select('id');
    expect(teams.data ?? []).toEqual([]);
    await expect(login(email, `Weer-${run}-anders-Cc3!`)).rejects.toBeTruthy();

    const aan = await roepAan('admin-set-active', { user_id: nieuwId, active: true }, itAdmin.token);
    expect(aan.status).toBe(200);
    const weer = await login(email, `Weer-${run}-anders-Cc3!`);
    expect(((await weer.client.from('tickets').select('id')).data ?? []).length).toBeGreaterThan(0);
  });

  it('een IT-admin kan zichzelf niet deactiveren', async () => {
    const r = await roepAan('admin-set-active', { user_id: itAdmin.id, active: false }, itAdmin.token);
    expect(r.status).toBe(400);
  });

  it('bulkimport geeft per regel resultaat en reden', async () => {
    const r = await roepAan(
      'admin-bulk-create-users',
      {
        users: [
          { email: `test.bulk1.${run}@example.com`, full_name: 'Test Bulk Een', team_prefix: 'FIN', role: 'handler' },
          { email: `test.bulk2.${run}@example.com`, full_name: 'Test Bulk Twee' },
          { email: `test.bulk3.${run}@gmail.com`, full_name: 'Verkeerd Domein' },
          { email: `test.bulk1.${run}@example.com`, full_name: 'Dubbel' },
          { email: `test.bulk4.${run}@example.com`, full_name: 'Onbekend Team', team_prefix: 'XYZ' },
        ],
      },
      itAdmin.token,
    );
    expect(r.status).toBe(200);
    const res = r.json.resultaten as { ok: boolean; reden?: string; temp_password?: string }[];
    expect(res.map((x) => x.ok)).toEqual([true, true, false, false, false]);
    expect(res[0]!.temp_password!.length).toBeGreaterThanOrEqual(12);
    expect(res[2]!.temp_password).toBeUndefined();
  });
});
