// Verplichte RLS-testset (specificatie sectie 5), op databaseniveau.
// Elke query draait als de rol `anon` of `authenticated` met de JWT-claims van
// een fictieve testgebruiker, precies zoals PostgREST dat doet. De scenario's
// via REST, Realtime en Edge Functions staan in tests/api (draaien in CI).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alsAnon,
  alsGebruiker,
  beheer,
  dienIn,
  koppel,
  maakGebruiker,
  pool,
  teamId,
  verwachtGeweigerd,
  type TestGebruiker,
} from './helpers';

let FIN: string;
let IT: string;
let A: TestGebruiker; // medewerker A
let B: TestGebruiker; // medewerker B
let finHandler: TestGebruiker;
let finAdmin: TestGebruiker;
let itHandler: TestGebruiker;
let itAdmin: TestGebruiker;
let gedeactiveerd: TestGebruiker;
let nieuw: TestGebruiker; // moet wachtwoord nog wijzigen

let bVertrouwelijkFin: { id: string; number: string };
let bOpenbaarFin: { id: string; number: string };
let itVertrouwelijk: { id: string; number: string };
let itOpenbaar: { id: string; number: string };
let gedeactiveerdTicket: { id: string; number: string };

beforeAll(async () => {
  FIN = await teamId('FIN');
  IT = await teamId('IT');

  A = await maakGebruiker('medewerker.a');
  B = await maakGebruiker('medewerker.b');
  finHandler = await maakGebruiker('handler.finance');
  finAdmin = await maakGebruiker('admin.finance');
  itHandler = await maakGebruiker('handler.it');
  itAdmin = await maakGebruiker('admin.it');
  gedeactiveerd = await maakGebruiker('gedeactiveerd');
  nieuw = await maakGebruiker('nieuw', { mustChange: true });

  await koppel(FIN, finHandler.id, 'handler');
  await koppel(FIN, finAdmin.id, 'admin');
  await koppel(IT, itHandler.id, 'handler');
  await koppel(IT, itAdmin.id, 'admin');

  bVertrouwelijkFin = await dienIn(B, { team: FIN, onderwerp: `Vertrouwelijke salarisvraag ${B.id}`, vertrouwelijk: true });
  bOpenbaarFin = await dienIn(B, { team: FIN, onderwerp: 'Declaratie reiskosten' });
  itVertrouwelijk = await dienIn(A, { team: IT, onderwerp: 'Vertrouwelijk IT-verzoek', vertrouwelijk: true });
  itOpenbaar = await dienIn(A, { team: IT, onderwerp: 'Laptop traag' });
  gedeactiveerdTicket = await dienIn(gedeactiveerd, { team: FIN, onderwerp: 'Ticket van vertrekkende collega' });

  // Reacties op het openbare ticket van B
  await alsGebruiker(
    finHandler.id,
    (c) =>
      c.query(
        `insert into public.ticket_comments (ticket_id, body, internal) values ($1, 'Reactie aan indiener', false), ($1, 'Interne notitie', true)`,
        [bOpenbaarFin.id],
      ),
    { commit: true },
  );

  // Daarna deactiveren (token blijft in deze test "geldig": claims worden gewoon meegegeven)
  await beheer(`update public.profiles set active = false where id = $1`, [gedeactiveerd.id]);
});

afterAll(async () => {
  await pool.end();
});

const telTickets = (uid: string) =>
  alsGebruiker(uid, async (c) => (await c.query<{ n: number }>('select count(*)::int as n from public.tickets')).rows[0]!.n);

const zietTicket = (uid: string, id: string) =>
  alsGebruiker(uid, async (c) => (await c.query('select 1 from public.tickets where id = $1', [id])).rowCount === 1);

describe('Zonder inlog (anon)', () => {
  it('heeft op geen enkele tabel, view, sequence of functie in public rechten', async () => {
    const tabellen = await beheer<{ naam: string }>(`
      select c.relname as naam
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','v','m','p','f','S')
         and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
           or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))`);
    expect(tabellen.rows).toEqual([]);

    const kolommen = await beheer<{ naam: string }>(`
      select c.relname || '.' || a.attname as naam
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and c.relkind in ('r','v')
         and has_column_privilege('anon', c.oid, a.attnum, 'SELECT,INSERT,UPDATE')`);
    expect(kolommen.rows).toEqual([]);

    const functies = await beheer<{ naam: string }>(`
      select p.proname as naam
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`);
    expect(functies.rows).toEqual([]);
  });

  it('kan geen tabel of view lezen', async () => {
    for (const t of ['teams', 'profiles', 'team_members', 'tickets', 'ticket_comments', 'ticket_counts']) {
      await verwachtGeweigerd(alsAnon((c) => c.query(`select * from public.${t} limit 1`)));
    }
  });

  it('kan niets schrijven', async () => {
    await verwachtGeweigerd(
      alsAnon((c) =>
        c.query(`insert into public.tickets (team_id, submitter_id, submitter_name, subject, description) values ($1, $2, 'x', 'x', 'x')`, [
          FIN,
          A.id,
        ]),
      ),
    );
    await verwachtGeweigerd(alsAnon((c) => c.query(`insert into public.teams (name, prefix) values ('Hack', 'HACK')`)));
    await verwachtGeweigerd(alsAnon((c) => c.query(`update public.tickets set status = 'afgerond'`)));
    await verwachtGeweigerd(alsAnon((c) => c.query(`delete from public.tickets`)));
  });

  it('kan geen functie uitvoeren', async () => {
    for (const f of [
      'public.is_active()',
      'public.has_access()',
      'public.is_it_admin()',
      `public.is_team_handler('${FIN}')`,
      'public.mark_password_changed()',
      `public.admin_snapshot_password('${A.id}')`,
    ]) {
      await verwachtGeweigerd(alsAnon((c) => c.query(`select ${f}`)));
    }
  });
});

describe('Medewerker A en de tickets van B', () => {
  it('ziet het vertrouwelijke ticket van B niet: lijst, id, tellingen, zoeken en nummer', async () => {
    await alsGebruiker(A.id, async (c) => {
      const lijst = await c.query('select id from public.tickets');
      expect(lijst.rows.map((r) => r.id)).not.toContain(bVertrouwelijkFin.id);

      const opId = await c.query('select 1 from public.tickets where id = $1', [bVertrouwelijkFin.id]);
      expect(opId.rowCount).toBe(0);

      const opNummer = await c.query('select 1 from public.tickets where number = $1', [bVertrouwelijkFin.number]);
      expect(opNummer.rowCount).toBe(0);

      const zoek = await c.query(`select 1 from public.tickets where subject ilike '%salarisvraag%' or description ilike '%salarisvraag%'`);
      expect(zoek.rowCount).toBe(0);

      const telling = await c.query<{ n: number }>(
        `select count(*)::int as n from public.tickets where team_id = $1 and submitter_id = $2`,
        [FIN, B.id],
      );
      expect(telling.rows[0]!.n).toBe(1); // alleen het openbare ticket

      const view = await c.query<{ aantal: number }>(
        `select coalesce(sum(aantal), 0)::int as aantal from public.ticket_counts where team_id = $1`,
        [FIN],
      );
      const zichtbaar = await c.query<{ n: number }>(`select count(*)::int as n from public.tickets where team_id = $1`, [FIN]);
      expect(view.rows[0]!.aantal).toBe(zichtbaar.rows[0]!.n);
    });
  });

  it('ziet het niet-vertrouwelijke ticket van B wel, maar kan het niet wijzigen', async () => {
    expect(await zietTicket(A.id, bOpenbaarFin.id)).toBe(true);

    await alsGebruiker(A.id, async (c) => {
      const upd = await c.query(`update public.tickets set status = 'afgerond' where id = $1`, [bOpenbaarFin.id]);
      expect(upd.rowCount).toBe(0);
      const upd2 = await c.query(`update public.tickets set status = 'geannuleerd' where id = $1`, [bOpenbaarFin.id]);
      expect(upd2.rowCount).toBe(0);
    });
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`update public.tickets set subject = 'gekaapt' where id = $1`, [bOpenbaarFin.id])),
    );
    const na = await beheer<{ status: string; subject: string }>(`select status, subject from public.tickets where id = $1`, [
      bOpenbaarFin.id,
    ]);
    expect(na.rows[0]).toEqual({ status: 'open', subject: 'Declaratie reiskosten' });
  });

  it('kan de tellers van teams niet lezen (die verraden het totaal)', async () => {
    await verwachtGeweigerd(alsGebruiker(A.id, (c) => c.query('select ticket_counter from public.teams')));
    await verwachtGeweigerd(alsGebruiker(A.id, (c) => c.query('select confidential_counter from public.teams')));
    await verwachtGeweigerd(alsGebruiker(A.id, (c) => c.query('select * from public.teams')));
  });

  it('B ziet zijn eigen vertrouwelijke ticket wel', async () => {
    expect(await zietTicket(B.id, bVertrouwelijkFin.id)).toBe(true);
  });
});

describe('Handlers en teams', () => {
  it('handler Finance ziet vertrouwelijke tickets van Finance, niet die van IT', async () => {
    expect(await zietTicket(finHandler.id, bVertrouwelijkFin.id)).toBe(true);
    expect(await zietTicket(finHandler.id, itVertrouwelijk.id)).toBe(false);
    expect(await zietTicket(finHandler.id, itOpenbaar.id)).toBe(true);
  });

  it('handler Finance kan geen enkel IT-ticket wijzigen, ook geen openbaar', async () => {
    await alsGebruiker(finHandler.id, async (c) => {
      const a = await c.query(`update public.tickets set status = 'afgerond' where id = $1`, [itOpenbaar.id]);
      const b = await c.query(`update public.tickets set priority = 'hoog' where id = $1`, [itOpenbaar.id]);
      const d = await c.query(`update public.tickets set status = 'afgerond' where id = $1`, [itVertrouwelijk.id]);
      expect([a.rowCount, b.rowCount, d.rowCount]).toEqual([0, 0, 0]);
    });
    await verwachtGeweigerd(
      alsGebruiker(finHandler.id, (c) =>
        c.query(`insert into public.ticket_comments (ticket_id, body) values ($1, 'Bemoeienis')`, [itOpenbaar.id]),
      ),
    );
  });

  it('handler Finance kan status en prioriteit van een Finance-ticket wijzigen; closed_at en updated_at volgen', async () => {
    await alsGebruiker(finHandler.id, async (c) => {
      const voor = await c.query<{ updated_at: Date }>(`select updated_at from public.tickets where id = $1`, [bOpenbaarFin.id]);
      await c.query(`select pg_sleep(0.01)`);
      const r = await c.query<{ status: string; priority: string; closed_at: Date | null; updated_at: Date }>(
        `update public.tickets set status = 'afgerond', priority = 'hoog' where id = $1 returning status, priority, closed_at, updated_at`,
        [bOpenbaarFin.id],
      );
      expect(r.rows[0]!.status).toBe('afgerond');
      expect(r.rows[0]!.priority).toBe('hoog');
      expect(r.rows[0]!.closed_at).not.toBeNull();
      // updated_at = now() van de transactie; in dezelfde transactie gelijk of later
      expect(r.rows[0]!.updated_at.getTime()).toBeGreaterThanOrEqual(voor.rows[0]!.updated_at.getTime());

      const heropen = await c.query<{ closed_at: Date | null }>(
        `update public.tickets set status = 'in_behandeling' where id = $1 returning closed_at`,
        [bOpenbaarFin.id],
      );
      expect(heropen.rows[0]!.closed_at).toBeNull();
    });
  });

  it('niemand kan tickets verwijderen', async () => {
    for (const u of [A, B, finHandler, itAdmin]) {
      await verwachtGeweigerd(alsGebruiker(u.id, (c) => c.query(`delete from public.tickets where id = $1`, [bOpenbaarFin.id])));
    }
  });
});

describe('Beheer: alleen IT-admins', () => {
  it('alleen een IT-admin kan een team aanmaken', async () => {
    for (const u of [A, finHandler, finAdmin, itHandler]) {
      await verwachtGeweigerd(alsGebruiker(u.id, (c) => c.query(`insert into public.teams (name, prefix) values ('Juridisch', 'JUR')`)));
    }
    await alsGebruiker(itAdmin.id, async (c) => {
      const r = await c.query(`insert into public.teams (name, prefix) values ('Juridisch', 'JUR') returning prefix`);
      expect(r.rows[0]!.prefix).toBe('JUR');
    });
  });

  it('alleen een IT-admin kan gebruikers aan teams koppelen of rollen wijzigen', async () => {
    for (const u of [A, finHandler, finAdmin, itHandler]) {
      await verwachtGeweigerd(
        alsGebruiker(u.id, (c) =>
          c.query(`insert into public.team_members (team_id, user_id, role) values ($1, $2, 'handler')`, [FIN, A.id]),
        ),
      );
      await alsGebruiker(u.id, async (c) => {
        const r = await c.query(`update public.team_members set role = 'admin' where user_id = $1`, [finHandler.id]);
        expect(r.rowCount).toBe(0);
        const d = await c.query(`delete from public.team_members where user_id = $1`, [finHandler.id]);
        expect(d.rowCount).toBe(0);
      });
    }
    await alsGebruiker(itAdmin.id, async (c) => {
      const r = await c.query(`insert into public.team_members (team_id, user_id, role) values ($1, $2, 'handler') returning role`, [
        FIN,
        A.id,
      ]);
      expect(r.rows[0]!.role).toBe('handler');
    });
  });

  it('teams wijzigen kan alleen een IT-admin; prefix ligt vast en IT blijft actief', async () => {
    await alsGebruiker(finAdmin.id, async (c) => {
      const r = await c.query(`update public.teams set active = false where id = $1`, [FIN]);
      expect(r.rowCount).toBe(0);
    });
    await verwachtGeweigerd(alsGebruiker(itAdmin.id, (c) => c.query(`update public.teams set prefix = 'FI' where id = $1`, [FIN])));
    await verwachtGeweigerd(alsGebruiker(itAdmin.id, (c) => c.query(`update public.teams set active = false where id = $1`, [IT])));
    await alsGebruiker(itAdmin.id, async (c) => {
      const r = await c.query(`update public.teams set active = false where id = $1`, [FIN]);
      expect(r.rowCount).toBe(1);
    });
  });

  it('de laatste actieve IT-admin kan niet worden verwijderd of gedegradeerd', async () => {
    const admins = await beheer<{ n: number }>(
      `select count(*)::int as n from public.team_members tm join public.profiles p on p.id = tm.user_id
        where tm.team_id = $1 and tm.role = 'admin' and p.active`,
      [IT],
    );
    // In een schone testdatabase is itAdmin de enige actieve IT-admin.
    if (admins.rows[0]!.n === 1) {
      await verwachtGeweigerd(
        alsGebruiker(itAdmin.id, (c) => c.query(`delete from public.team_members where user_id = $1 and team_id = $2`, [itAdmin.id, IT])),
      );
      await verwachtGeweigerd(
        alsGebruiker(itAdmin.id, (c) =>
          c.query(`update public.team_members set role = 'handler' where user_id = $1 and team_id = $2`, [itAdmin.id, IT]),
        ),
      );
    }
  });

  it('een IT-admin ziet alle profielen en lidmaatschappen', async () => {
    await alsGebruiker(itAdmin.id, async (c) => {
      const p = await c.query('select id from public.profiles where id = any($1)', [[A.id, B.id, finHandler.id]]);
      expect(p.rowCount).toBe(3);
      const tm = await c.query('select 1 from public.team_members where user_id = $1', [finHandler.id]);
      expect(tm.rowCount).toBe(1);
    });
  });

  it('admin_snapshot_password is alleen voor service_role', async () => {
    for (const u of [A, itAdmin]) {
      await verwachtGeweigerd(alsGebruiker(u.id, (c) => c.query(`select public.admin_snapshot_password($1)`, [u.id])));
    }
  });
});

describe('Eigen profiel en rollen', () => {
  it('een medewerker kan zichzelf geen rol geven', async () => {
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`insert into public.team_members (team_id, user_id, role) values ($1, $2, 'admin')`, [IT, A.id])),
    );
  });

  it('een medewerker kan active, must_change_password en e-mail niet wijzigen', async () => {
    await verwachtGeweigerd(alsGebruiker(A.id, (c) => c.query(`update public.profiles set active = false where id = $1`, [A.id])));
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`update public.profiles set must_change_password = true where id = $1`, [A.id])),
    );
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`update public.profiles set email = 'ander@example.com' where id = $1`, [A.id])),
    );
    await verwachtGeweigerd(alsGebruiker(A.id, (c) => c.query(`delete from public.profiles where id = $1`, [A.id])));
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) =>
        c.query(`insert into public.profiles (id, full_name, email) values ($1, 'x', 'x@example.com')`, [B.id]),
      ),
    );
  });

  it('een medewerker kan zijn eigen naam wijzigen, niet die van een ander', async () => {
    await alsGebruiker(A.id, async (c) => {
      const eigen = await c.query(`update public.profiles set full_name = 'Test A aangepast' where id = $1`, [A.id]);
      expect(eigen.rowCount).toBe(1);
      const ander = await c.query(`update public.profiles set full_name = 'Gekaapt' where id = $1`, [B.id]);
      expect(ander.rowCount).toBe(0);
    });
  });

  it('een medewerker ziet alleen het eigen profiel', async () => {
    await alsGebruiker(A.id, async (c) => {
      const r = await c.query('select id from public.profiles');
      expect(r.rows.map((x) => x.id)).toEqual([A.id]);
    });
  });

  it('een handler ziet profielen van indieners van tickets van het eigen team, niet van anderen', async () => {
    await alsGebruiker(finHandler.id, async (c) => {
      const b = await c.query('select email from public.profiles where id = $1', [B.id]);
      expect(b.rowCount).toBe(1);
      const itHandlerProfiel = await c.query('select 1 from public.profiles where id = $1', [itHandler.id]);
      expect(itHandlerProfiel.rowCount).toBe(0);
    });
    await alsGebruiker(itHandler.id, async (c) => {
      const b = await c.query('select 1 from public.profiles where id = $1', [B.id]);
      expect(b.rowCount).toBe(0);
    });
  });

  it('een medewerker kan geen team aanmaken', async () => {
    await verwachtGeweigerd(alsGebruiker(A.id, (c) => c.query(`insert into public.teams (name, prefix) values ('Eigen', 'EIG')`)));
  });

  it('is_it_admin en is_team_handler geven alleen informatie over de aanroeper', async () => {
    await alsGebruiker(A.id, async (c) => {
      const r = await c.query<{ a: boolean; h: boolean }>(`select public.is_it_admin() as a, public.is_team_handler($1) as h`, [FIN]);
      expect(r.rows[0]).toEqual({ a: false, h: false });
    });
    await alsGebruiker(itAdmin.id, async (c) => {
      const r = await c.query<{ a: boolean }>(`select public.is_it_admin() as a`);
      expect(r.rows[0]!.a).toBe(true);
    });
  });

  it('rol uit JWT-claims of user_metadata telt niet', async () => {
    await beheer(`update auth.users set raw_user_meta_data = '{"role":"admin","team":"IT"}' where id = $1`, [A.id]);
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: A.id, role: 'authenticated', user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } }),
      ]);
      await c.query('set local role authenticated');
      const r = await c.query<{ a: boolean }>('select public.is_it_admin() as a');
      expect(r.rows[0]!.a).toBe(false);
      const t = await c.query('select 1 from public.tickets where id = $1', [itVertrouwelijk.id]);
      expect(t.rowCount).toBe(1); // eigen ticket van A, dus zichtbaar
      const t2 = await c.query('select 1 from public.tickets where id = $1', [bVertrouwelijkFin.id]);
      expect(t2.rowCount).toBe(0);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});

describe('Gedeactiveerde gebruiker met geldig token', () => {
  it('krijgt nergens iets terug', async () => {
    await alsGebruiker(gedeactiveerd.id, async (c) => {
      for (const t of ['tickets', 'ticket_comments', 'profiles', 'team_members', 'ticket_counts']) {
        const r = await c.query(`select * from public.${t}`);
        expect(r.rowCount, t).toBe(0);
      }
      const teams = await c.query('select id from public.teams');
      expect(teams.rowCount).toBe(0);
      const eigen = await c.query('select 1 from public.tickets where id = $1', [gedeactiveerdTicket.id]);
      expect(eigen.rowCount).toBe(0);
    });
  });

  it('kan niets schrijven', async () => {
    await verwachtGeweigerd(
      alsGebruiker(gedeactiveerd.id, (c) =>
        c.query(`insert into public.tickets (team_id, submitter_name, subject, description) values ($1, 'x', 'x', 'x')`, [FIN]),
      ),
    );
    await verwachtGeweigerd(alsGebruiker(gedeactiveerd.id, (c) => c.query('select public.mark_password_changed()')));
    await alsGebruiker(gedeactiveerd.id, async (c) => {
      const r = await c.query(`update public.tickets set status = 'geannuleerd' where id = $1`, [gedeactiveerdTicket.id]);
      expect(r.rowCount).toBe(0);
    });
  });

  it('zijn tickets blijven bestaan en zichtbaar voor anderen', async () => {
    expect(await zietTicket(A.id, gedeactiveerdTicket.id)).toBe(true);
  });
});

describe('Tickets indienen', () => {
  it('namens een ander indienen wordt geweigerd', async () => {
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) =>
        c.query(
          `insert into public.tickets (team_id, submitter_id, submitter_name, subject, description) values ($1, $2, 'B', 'Namens B', 'x')`,
          [FIN, B.id],
        ),
      ),
    );
  });

  it('een andere beginstatus dan open wordt geweigerd', async () => {
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) =>
        c.query(
          `insert into public.tickets (team_id, submitter_name, subject, description, status) values ($1, 'A', 'x', 'x', 'afgerond')`,
          [FIN],
        ),
      ),
    );
  });

  it('een zelfgekozen ticketnummer wordt geweigerd', async () => {
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) =>
        c.query(`insert into public.tickets (team_id, submitter_name, subject, description, number) values ($1, 'A', 'x', 'x', 'FIN-9999')`, [
          FIN,
        ]),
      ),
    );
  });

  it('een inactief team accepteert geen tickets', async () => {
    const hr = await teamId('HR');
    await beheer('update public.teams set active = false where id = $1', [hr]);
    try {
      await expect(dienIn(A, { team: hr, onderwerp: 'Naar inactief team' })).rejects.toMatchObject({ code: '23503' });
    } finally {
      await beheer('update public.teams set active = true where id = $1', [hr]);
    }
  });

  it('nummers: openbaar FIN-0000, vertrouwelijk FIN-V-0000, zonder dubbelingen bij gelijktijdige inzendingen', async () => {
    expect(bOpenbaarFin.number).toMatch(/^FIN-\d{4}$/);
    expect(bVertrouwelijkFin.number).toMatch(/^FIN-V-\d{4}$/);
    expect(itOpenbaar.number).toMatch(/^IT-\d{4}$/);

    const aantal = 10;
    const resultaten = await Promise.all(
      Array.from({ length: aantal }, (_, i) => dienIn(i % 2 ? A : B, { team: FIN, onderwerp: `Gelijktijdig ${i}` })),
    );
    const nummers = resultaten.map((r) => r.number);
    expect(new Set(nummers).size).toBe(aantal);
    const volgnummers = nummers.map((n) => Number(n.split('-')[1])).sort((x, y) => x - y);
    for (let i = 1; i < volgnummers.length; i++) {
      expect(volgnummers[i]).toBe(volgnummers[i - 1]! + 1);
    }
  });

  it('de openbare nummering heeft geen gaten door vertrouwelijke tickets', async () => {
    const eerste = await dienIn(A, { team: FIN, onderwerp: 'Openbaar 1' });
    await dienIn(A, { team: FIN, onderwerp: 'Vertrouwelijk tussendoor', vertrouwelijk: true });
    const tweede = await dienIn(A, { team: FIN, onderwerp: 'Openbaar 2' });
    expect(Number(tweede.number.split('-')[1])).toBe(Number(eerste.number.split('-')[1]) + 1);
  });
});

describe('Annuleren door de indiener', () => {
  it('kan een eigen open ticket annuleren, maar niets anders wijzigen', async () => {
    const t = await dienIn(A, { team: FIN, onderwerp: 'Toch niet nodig' });
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`update public.tickets set priority = 'hoog', status = 'geannuleerd' where id = $1`, [t.id])),
    );
    // Zelf afronden: de trigger weigert (de rij valt wel onder de annuleer-policy).
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`update public.tickets set status = 'afgerond' where id = $1`, [t.id])),
    );
    await alsGebruiker(
      A.id,
      async (c) => {
        const r = await c.query<{ status: string; closed_at: Date | null }>(
          `update public.tickets set status = 'geannuleerd' where id = $1 returning status, closed_at`,
          [t.id],
        );
        expect(r.rows[0]!.status).toBe('geannuleerd');
        expect(r.rows[0]!.closed_at).not.toBeNull();
      },
      { commit: true },
    );
    // Daarna kan de indiener niet heropenen
    await alsGebruiker(A.id, async (c) => {
      const r = await c.query(`update public.tickets set status = 'open' where id = $1`, [t.id]);
      expect(r.rowCount).toBe(0);
    });
  });

  it('kan niet annuleren zodra het ticket in behandeling is', async () => {
    const t = await dienIn(A, { team: FIN, onderwerp: 'Al opgepakt' });
    await alsGebruiker(finHandler.id, (c) => c.query(`update public.tickets set status = 'in_behandeling' where id = $1`, [t.id]), {
      commit: true,
    });
    await alsGebruiker(A.id, async (c) => {
      const r = await c.query(`update public.tickets set status = 'geannuleerd' where id = $1`, [t.id]);
      expect(r.rowCount).toBe(0);
    });
  });
});

describe('Reacties', () => {
  it('niet-interne reacties op een openbaar ticket zijn niet zichtbaar voor collega\'s', async () => {
    await alsGebruiker(A.id, async (c) => {
      const r = await c.query('select 1 from public.ticket_comments where ticket_id = $1', [bOpenbaarFin.id]);
      expect(r.rowCount).toBe(0);
    });
    await alsGebruiker(itHandler.id, async (c) => {
      const r = await c.query('select 1 from public.ticket_comments where ticket_id = $1', [bOpenbaarFin.id]);
      expect(r.rowCount).toBe(0);
    });
  });

  it('de indiener ziet niet-interne reacties, geen interne notities', async () => {
    await alsGebruiker(B.id, async (c) => {
      const r = await c.query<{ body: string; author_name: string }>(
        'select body, author_name from public.ticket_comments where ticket_id = $1',
        [bOpenbaarFin.id],
      );
      expect(r.rows.map((x) => x.body)).toEqual(['Reactie aan indiener']);
      expect(r.rows[0]!.author_name).toBe(finHandler.naam);
    });
  });

  it('handlers van het team zien alles', async () => {
    await alsGebruiker(finAdmin.id, async (c) => {
      const r = await c.query('select 1 from public.ticket_comments where ticket_id = $1', [bOpenbaarFin.id]);
      expect(r.rowCount).toBe(2);
    });
  });

  it('de indiener kan reageren, maar geen interne notitie plaatsen of als ander schrijven', async () => {
    await alsGebruiker(B.id, async (c) => {
      const r = await c.query(`insert into public.ticket_comments (ticket_id, body) values ($1, 'Dank je') returning internal`, [
        bOpenbaarFin.id,
      ]);
      expect(r.rows[0]!.internal).toBe(false);
    });
    await verwachtGeweigerd(
      alsGebruiker(B.id, (c) =>
        c.query(`insert into public.ticket_comments (ticket_id, body, internal) values ($1, 'Stiekem intern', true)`, [bOpenbaarFin.id]),
      ),
    );
    await verwachtGeweigerd(
      alsGebruiker(B.id, (c) =>
        c.query(`insert into public.ticket_comments (ticket_id, body, author_id) values ($1, 'Namens handler', $2)`, [
          bOpenbaarFin.id,
          finHandler.id,
        ]),
      ),
    );
  });

  it('een collega kan niet reageren op het ticket van een ander', async () => {
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) => c.query(`insert into public.ticket_comments (ticket_id, body) values ($1, 'Ik ook')`, [bOpenbaarFin.id])),
    );
    await verwachtGeweigerd(
      alsGebruiker(A.id, (c) =>
        c.query(`insert into public.ticket_comments (ticket_id, body) values ($1, 'Raden')`, [bVertrouwelijkFin.id]),
      ),
    );
  });

  it('reacties kunnen niet worden gewijzigd of verwijderd', async () => {
    await verwachtGeweigerd(alsGebruiker(finHandler.id, (c) => c.query(`update public.ticket_comments set body = 'x'`)));
    await verwachtGeweigerd(alsGebruiker(finHandler.id, (c) => c.query(`delete from public.ticket_comments`)));
  });
});

describe('Tijdelijk wachtwoord', () => {
  it('geeft alleen het eigen profiel terug, geen tickets of teams', async () => {
    await alsGebruiker(nieuw.id, async (c) => {
      const p = await c.query<{ must_change_password: boolean }>('select must_change_password from public.profiles');
      expect(p.rows).toEqual([{ must_change_password: true }]);
      expect((await c.query('select 1 from public.tickets')).rowCount).toBe(0);
      expect((await c.query('select 1 from public.teams')).rowCount).toBe(0);
    });
    await verwachtGeweigerd(
      alsGebruiker(nieuw.id, (c) =>
        c.query(`insert into public.tickets (team_id, submitter_name, subject, description) values ($1, 'x', 'x', 'x')`, [FIN]),
      ),
    );
  });

  it('must_change_password gaat pas uit na een echte wachtwoordwijziging', async () => {
    // Snapshot van het tijdelijke wachtwoord, zoals de Edge Function doet
    await beheer('select public.admin_snapshot_password($1)', [nieuw.id]);
    await verwachtGeweigerd(alsGebruiker(nieuw.id, (c) => c.query('select public.mark_password_changed()')));

    // Wachtwoord wijzigen (in Supabase doet GoTrue dit)
    await beheer(`update auth.users set encrypted_password = 'hash-nieuw' where id = $1`, [nieuw.id]);
    await alsGebruiker(nieuw.id, (c) => c.query('select public.mark_password_changed()'), { commit: true });

    const p = await beheer<{ must_change_password: boolean }>('select must_change_password from public.profiles where id = $1', [nieuw.id]);
    expect(p.rows[0]!.must_change_password).toBe(false);
    expect(await telTickets(nieuw.id)).toBeGreaterThan(0);
  });

  it('mark_password_changed raakt alleen de eigen rij', async () => {
    await beheer('update public.profiles set must_change_password = true where id = $1', [B.id]);
    try {
      await alsGebruiker(A.id, (c) => c.query('select public.mark_password_changed()'), { commit: true });
      const b = await beheer<{ must_change_password: boolean }>('select must_change_password from public.profiles where id = $1', [B.id]);
      expect(b.rows[0]!.must_change_password).toBe(true);
    } finally {
      await beheer('update public.profiles set must_change_password = false where id = $1', [B.id]);
    }
  });
});
