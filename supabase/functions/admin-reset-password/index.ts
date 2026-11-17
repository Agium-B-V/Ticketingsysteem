// Zet een nieuw tijdelijk wachtwoord en zet must_change_password weer aan.
// Invoer: { user_id }

import { beheerFunctie, InvoerFout } from '../_shared/deno/beheer.ts';
import { bestaatProfiel, zetTijdelijkWachtwoord } from '../_shared/deno/accounts.ts';
import { valideerUuid } from '../_shared/logic/validatie.ts';

Deno.serve(
  beheerFunctie('admin-reset-password', async ({ body, admin }) => {
    const id = valideerUuid(body.user_id);
    if (!id.ok) throw new InvoerFout(id.reden);
    const profiel = await bestaatProfiel(admin, id.waarde);
    const wachtwoord = await zetTijdelijkWachtwoord(admin, id.waarde);
    return { user_id: id.waarde, email: profiel.email, temp_password: wachtwoord };
  }),
);
