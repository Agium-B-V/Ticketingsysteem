// Maakt meerdere accounts aan (uit een CSV die de app omzet naar JSON).
// Invoer: { users: [{ email, full_name, team_prefix?, role? }] } (max 200)
// Uitvoer per regel: gelukt/mislukt met reden, en bij succes het tijdelijke
// wachtwoord (alleen in dit antwoord; nergens opgeslagen).

import { beheerFunctie, InvoerFout, toegestaneDomeinen } from '../_shared/deno/beheer.ts';
import { maakAccount } from '../_shared/deno/accounts.ts';
import { MAX_BULK, parseDomeinen, valideerBulkRegel } from '../_shared/logic/validatie.ts';

interface RegelResultaat {
  regel: number;
  email: string;
  ok: boolean;
  reden?: string;
  temp_password?: string;
}

Deno.serve(
  beheerFunctie('admin-bulk-create-users', async ({ body, admin }) => {
    const regels = body.users;
    if (!Array.isArray(regels) || regels.length === 0) throw new InvoerFout('Geen gebruikers opgegeven');
    if (regels.length > MAX_BULK) throw new InvoerFout(`Maximaal ${MAX_BULK} gebruikers per keer`);

    const domeinen = parseDomeinen(toegestaneDomeinen());
    const { data: teams, error } = await admin.from('teams').select('id, prefix');
    if (error) throw error;
    const teamOpPrefix = new Map((teams ?? []).map((t: { id: string; prefix: string }) => [t.prefix, t.id]));

    const resultaten: RegelResultaat[] = [];
    const gezien = new Set<string>();

    for (let i = 0; i < regels.length; i++) {
      const regelNr = i + 1;
      const ruweEmail = typeof (regels[i] as { email?: unknown })?.email === 'string' ? String((regels[i] as { email: string }).email).trim() : '';
      const v = valideerBulkRegel(regels[i], domeinen);
      if (!v.ok) {
        resultaten.push({ regel: regelNr, email: ruweEmail, ok: false, reden: v.reden });
        continue;
      }
      const r = v.waarde;
      if (gezien.has(r.email)) {
        resultaten.push({ regel: regelNr, email: r.email, ok: false, reden: 'Dubbel in het bestand' });
        continue;
      }
      gezien.add(r.email);

      let memberships: { team_id: string; role: 'handler' | 'admin' }[] = [];
      if (r.team_prefix) {
        const teamId = teamOpPrefix.get(r.team_prefix);
        if (!teamId) {
          resultaten.push({ regel: regelNr, email: r.email, ok: false, reden: `Team ${r.team_prefix} bestaat niet` });
          continue;
        }
        memberships = [{ team_id: teamId, role: r.role ?? 'handler' }];
      }

      try {
        const account = await maakAccount(admin, { email: r.email, full_name: r.full_name, memberships });
        resultaten.push({ regel: regelNr, email: r.email, ok: true, temp_password: account.temp_password });
      } catch (err) {
        const reden = err instanceof InvoerFout ? err.message : 'Aanmaken mislukt';
        resultaten.push({ regel: regelNr, email: r.email, ok: false, reden });
      }
    }

    return {
      resultaten,
      gelukt: resultaten.filter((r) => r.ok).length,
      mislukt: resultaten.filter((r) => !r.ok).length,
    };
  }),
);
