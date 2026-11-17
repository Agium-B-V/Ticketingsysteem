import pg from 'pg';
import { randomUUID } from 'node:crypto';

// Verbindt met een lokale of tijdelijke testdatabase. Weigert alles wat niet
// lokaal is, zodat de testset nooit per ongeluk tegen productie draait.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL ontbreekt. Gebruik `npm run test:db:lokaal` of een lokale Supabase.');
}
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
  throw new Error(`De RLS-testset draait alleen tegen een lokale database, niet tegen ${host}.`);
}

export const pool = new pg.Pool({ connectionString: url, max: 12 });

export type Rol = 'anon' | 'authenticated';

export interface AlsOpties {
  commit?: boolean;
}

/**
 * Voert `fn` uit als de opgegeven databaserol met de JWT-claims van gebruiker
 * `uid`, net als PostgREST doet. Standaard wordt alles teruggedraaid.
 */
export async function als<T>(
  rol: Rol,
  uid: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
  opties: AlsOpties = {},
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const claims = uid ? { sub: uid, role: rol, aud: 'authenticated' } : { role: rol };
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`set local role ${rol}`);
    const res = await fn(c);
    await c.query(opties.commit ? 'commit' : 'rollback');
    return res;
  } catch (err) {
    await c.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export const alsGebruiker = <T>(uid: string, fn: (c: pg.PoolClient) => Promise<T>, opties?: AlsOpties) =>
  als('authenticated', uid, fn, opties);

export const alsAnon = <T>(fn: (c: pg.PoolClient) => Promise<T>) => als('anon', null, fn);

/** Verwacht dat de query wordt geweigerd (rechten of RLS). Geeft de foutcode terug. */
export async function verwachtGeweigerd(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    // 42501 = insufficient_privilege (ook RLS-schending), P0001 = raise in functie
    if (['42501', 'P0001'].includes(code)) return code;
    throw new Error(`Onverwachte fout ${code}: ${(err as Error).message}`, { cause: err });
  }
  throw new Error('Verwacht geweigerd, maar de query slaagde');
}

/** Query als eigenaar (postgres), alleen voor testopbouw en controle. */
export async function beheer<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  return pool.query<T>(sql, params);
}

export interface TestGebruiker {
  id: string;
  email: string;
  naam: string;
}

export const run = randomUUID().slice(0, 8);

/** Maakt een fictieve testgebruiker aan (auth.users + profiel). */
export async function maakGebruiker(
  sleutel: string,
  opties: { mustChange?: boolean; actief?: boolean } = {},
): Promise<TestGebruiker> {
  const id = randomUUID();
  const email = `test.${sleutel}.${run}@example.com`;
  const naam = `Test ${sleutel}`;
  await beheer(`insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)`, [
    id,
    email,
    `hash-tijdelijk-${id}`,
  ]);
  await beheer(
    `insert into public.profiles (id, full_name, email, must_change_password, active) values ($1, $2, $3, $4, $5)`,
    [id, naam, email, opties.mustChange ?? false, opties.actief ?? true],
  );
  return { id, email, naam };
}

export async function koppel(teamId: string, userId: string, rol: 'handler' | 'admin') {
  await beheer(`insert into public.team_members (team_id, user_id, role) values ($1, $2, $3)`, [teamId, userId, rol]);
}

export async function teamId(prefix: string): Promise<string> {
  const r = await beheer<{ id: string }>(`select id from public.teams where prefix = $1`, [prefix]);
  const id = r.rows[0]?.id;
  if (!id) throw new Error(`Team ${prefix} ontbreekt`);
  return id;
}

export interface TicketInvoer {
  team: string;
  onderwerp: string;
  vertrouwelijk?: boolean;
  prioriteit?: 'laag' | 'midden' | 'hoog';
}

/** Dient een ticket in als de gebruiker zelf (via RLS) en commit. */
export async function dienIn(g: TestGebruiker, t: TicketInvoer) {
  return alsGebruiker(
    g.id,
    async (c) => {
      const r = await c.query<{ id: string; number: string }>(
        `insert into public.tickets (team_id, submitter_name, subject, description, priority, confidential)
         values ($1, $2, $3, $4, $5, $6) returning id, number`,
        [t.team, g.naam, t.onderwerp, `Omschrijving van ${t.onderwerp}`, t.prioriteit ?? 'midden', t.vertrouwelijk ?? false],
      );
      return r.rows[0]!;
    },
    { commit: true },
  );
}
