import { Navigate } from 'react-router-dom';
import { TicketLijst } from '../components/TicketLijst';
import { Badge, Kaart, Laden, Melding, PaginaKop } from '../components/ui';
import { useAuth } from '../lib/auth';
import { STATUS_LABEL, STATUSSEN } from '../lib/format';
import { useData, useTicketUpdates } from '../lib/hooks';
import { ok, supabase } from '../lib/supabase';
import { TICKET_KOLOMMEN, type Telling, type TicketRij } from '../lib/types';

export function DashboardPagina() {
  const { teams, handlerTeams } = useAuth();
  const mijnTeams = teams.filter((t) => handlerTeams.has(t.id));
  const sleutel = [...handlerTeams].sort().join(',');

  const data = useData(async () => {
    const [tickets, tellingen] = await Promise.all([
      supabase.from('tickets').select(TICKET_KOLOMMEN).order('updated_at', { ascending: false }),
      supabase.from('ticket_counts').select('team_id, status, aantal'),
    ]);
    return { tickets: ok(tickets) as TicketRij[], tellingen: ok(tellingen) as Telling[] };
  }, `dashboard-${sleutel}`);
  useTicketUpdates(data.herlaad);

  if (handlerTeams.size === 0) return <Navigate to="/" replace />;

  // Eigen teams (alles, ook vertrouwelijk) plus openbare tickets van andere teams (alleen lezen).
  const tickets = (data.data?.tickets ?? []).filter((t) => handlerTeams.has(t.team_id) || !t.confidential);

  return (
    <>
      <PaginaKop eyebrow="Dashboard" titel="Tickets behandelen">
        Je behandelt tickets voor {mijnTeams.map((t) => t.name).join(', ')}. Tickets van andere teams zie je alleen-lezen.
      </PaginaKop>

      {data.laden ? (
        <Laden />
      ) : data.fout ? (
        <Melding variant="aandacht" titel="Laden mislukt">
          {data.fout}
        </Melding>
      ) : (
        <>
          <div className="stats">
            {mijnTeams.map((team) => {
              const rijen = (data.data?.tellingen ?? []).filter((r) => r.team_id === team.id);
              const aantal = (s: string) => rijen.find((r) => r.status === s)?.aantal ?? 0;
              const lopend = aantal('open') + aantal('in_behandeling');
              return (
                <Kaart key={team.id} variant="compact" aria-label={`Aantallen ${team.name}`}>
                  <div className="rij rij--tussen">
                    <span className="eyebrow">{team.name}</span>
                    <span className="muted klein">{team.prefix}</span>
                  </div>
                  <div className="stat__waarde" style={{ marginTop: 'var(--space-2)' }}>
                    {lopend}
                  </div>
                  <div className="muted klein">lopend (open of in behandeling)</div>
                  <div className="stat__regels">
                    {STATUSSEN.map((s) => (
                      <Badge key={s} variant={s === 'open' ? 'info' : s === 'in_behandeling' ? 'solide' : s === 'afgerond' ? 'positief' : 'rand'}>
                        {STATUS_LABEL[s]}: {aantal(s)}
                      </Badge>
                    ))}
                  </div>
                </Kaart>
              );
            })}
          </div>

          <TicketLijst
            tickets={tickets}
            teams={teams}
            titel="Tickets voor behandelaars"
            legeTekst="Er zijn nog geen tickets voor je teams."
            toonBijgewerkt
            handlerTeams={handlerTeams}
          />
        </>
      )}
    </>
  );
}
