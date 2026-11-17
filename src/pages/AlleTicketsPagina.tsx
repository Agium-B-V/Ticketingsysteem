import { TicketLijst } from '../components/TicketLijst';
import { Laden, Melding, PaginaKop } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useData, useTicketUpdates } from '../lib/hooks';
import { ok, supabase } from '../lib/supabase';
import { TICKET_KOLOMMEN, type TicketRij } from '../lib/types';

export function AlleTicketsPagina() {
  const { teams } = useAuth();
  // Alleen niet-vertrouwelijke tickets. RLS zorgt er daarnaast voor dat
  // vertrouwelijke tickets van anderen nooit worden teruggegeven.
  const lijst = useData(
    async () =>
      ok(
        await supabase.from('tickets').select(TICKET_KOLOMMEN).eq('confidential', false).order('created_at', { ascending: false }),
      ) as TicketRij[],
    'alle',
  );
  useTicketUpdates(lijst.herlaad);

  return (
    <>
      <PaginaKop eyebrow="Alle tickets" titel="Openbare tickets">
        Alle niet-vertrouwelijke tickets van je collega's. Reacties zijn alleen zichtbaar voor de indiener en het team.
      </PaginaKop>
      {lijst.laden ? (
        <Laden />
      ) : lijst.fout ? (
        <Melding variant="aandacht" titel="Laden mislukt">
          {lijst.fout}
        </Melding>
      ) : (
        <TicketLijst tickets={lijst.data ?? []} teams={teams} titel="Openbare tickets" legeTekst="Er zijn nog geen openbare tickets." />
      )}
    </>
  );
}
