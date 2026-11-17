// Maakt één account aan: Auth-gebruiker (e-mail bevestigd), profiel en
// teamlidmaatschappen. Geeft het tijdelijke wachtwoord eenmalig terug.
// Invoer: { email, full_name, memberships?: [{ team_id, role }] }

import { beheerFunctie, InvoerFout, toegestaneDomeinen } from '../_shared/deno/beheer.ts';
import { controleerTeams, maakAccount } from '../_shared/deno/accounts.ts';
import { parseDomeinen, valideerEmail, valideerLidmaatschappen, valideerNaam } from '../_shared/logic/validatie.ts';

Deno.serve(
  beheerFunctie('admin-create-user', async ({ body, admin }) => {
    const email = valideerEmail(body.email, parseDomeinen(toegestaneDomeinen()));
    if (!email.ok) throw new InvoerFout(email.reden);
    const naam = valideerNaam(body.full_name);
    if (!naam.ok) throw new InvoerFout(naam.reden);
    const leden = valideerLidmaatschappen(body.memberships);
    if (!leden.ok) throw new InvoerFout(leden.reden);

    await controleerTeams(admin, leden.waarde.map((m) => m.team_id));

    const account = await maakAccount(admin, {
      email: email.waarde,
      full_name: naam.waarde,
      memberships: leden.waarde,
    });
    return { ...account };
  }),
);
