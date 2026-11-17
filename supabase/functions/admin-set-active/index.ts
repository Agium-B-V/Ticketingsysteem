// Deactiveert of heractiveert een gebruiker: profiles.active (werkt direct via
// RLS, ook voor een nog geldig token) plus een ban in Supabase Auth (geen
// nieuwe logins of token-verversing). Tickets blijven bestaan.
// Invoer: { user_id, active: boolean }

import { beheerFunctie, InvoerFout } from '../_shared/deno/beheer.ts';
import { bestaatProfiel } from '../_shared/deno/accounts.ts';
import { valideerUuid } from '../_shared/logic/validatie.ts';

// Ruim 100 jaar: in de praktijk permanent tot heractivering.
const BAN_DUUR = '876000h';

Deno.serve(
  beheerFunctie('admin-set-active', async ({ body, admin, callerId }) => {
    const id = valideerUuid(body.user_id);
    if (!id.ok) throw new InvoerFout(id.reden);
    if (typeof body.active !== 'boolean') throw new InvoerFout('Geef aan of de gebruiker actief moet zijn');
    const actief = body.active;
    if (!actief && id.waarde === callerId) throw new InvoerFout('Je kunt jezelf niet deactiveren');

    await bestaatProfiel(admin, id.waarde);

    if (actief) {
      // Eerst de ban opheffen, dan pas toegang geven.
      const { error } = await admin.auth.admin.updateUserById(id.waarde, { ban_duration: 'none' });
      if (error) throw error;
      const { error: pFout } = await admin.from('profiles').update({ active: true }).eq('id', id.waarde);
      if (pFout) throw pFout;
    } else {
      // Eerst toegang intrekken (direct effect), dan bannen.
      const { error: pFout } = await admin.from('profiles').update({ active: false }).eq('id', id.waarde);
      if (pFout) throw pFout;
      const { error } = await admin.auth.admin.updateUserById(id.waarde, { ban_duration: BAN_DUUR });
      if (error) throw error;
    }

    return { user_id: id.waarde, active: actief };
  }),
);
