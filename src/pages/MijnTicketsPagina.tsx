import { Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TicketLijst } from '../components/TicketLijst';
import { Kaart, Knop, Laden, Melding, PaginaKop } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useData, useTicketUpdates } from '../lib/hooks';
import { ok, supabase } from '../lib/supabase';
import { TICKET_KOLOMMEN, type TicketRij } from '../lib/types';

export function MijnTicketsPagina() {
  const { profiel, teams } = useAuth();
  const navigate = useNavigate();
  const [zoek, setZoek] = useState('');
  const [zoekFout, setZoekFout] = useState<string | null>(null);
  const [zoeken, setZoeken] = useState(false);

  const mijn = useData(
    async () =>
      ok(
        await supabase
          .from('tickets')
          .select(TICKET_KOLOMMEN)
          .eq('submitter_id', profiel!.id)
          .order('created_at', { ascending: false }),
      ) as TicketRij[],
    `mijn-${profiel?.id}`,
  );
  useTicketUpdates(mijn.herlaad);

  async function zoekNummer(e: FormEvent) {
    e.preventDefault();
    setZoekFout(null);
    const nummer = zoek.trim().toUpperCase();
    if (!/^[A-Z]{2,6}-(V-)?\d{4,}$/.test(nummer)) {
      setZoekFout('Vul een ticketnummer in, bijvoorbeeld FIN-0007.');
      return;
    }
    setZoeken(true);
    // RLS bepaalt wat je mag zien: een nummer dat je niet mag zien geeft dezelfde melding als een nummer dat niet bestaat.
    const { data, error } = await supabase.from('tickets').select('number').eq('number', nummer).maybeSingle();
    setZoeken(false);
    if (error || !data) {
      setZoekFout('Geen ticket gevonden met dit nummer.');
      return;
    }
    navigate(`/tickets/${encodeURIComponent(data.number as string)}`);
  }

  return (
    <>
      <PaginaKop
        eyebrow="Mijn tickets"
        titel={`Hallo ${profiel?.full_name.split(' ')[0] ?? ''}`}
        actie={
          <Link to="/nieuw" className="knop knop--primair">
            <Plus size={18} aria-hidden="true" />
            Nieuw ticket
          </Link>
        }
      >
        Hier volg je je eigen tickets, ook de vertrouwelijke.
      </PaginaKop>

      <Kaart variant="zacht" className="stapel" aria-label="Ticket zoeken">
        <form className="rij" onSubmit={zoekNummer} role="search" style={{ alignItems: 'flex-end' }}>
          <div className="veld" style={{ flex: '1 1 240px' }}>
            <label className="veld__label" htmlFor="zoek-nummer">
              Ticket opzoeken op nummer
            </label>
            <input
              id="zoek-nummer"
              className="invoer"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="FIN-0007"
              autoComplete="off"
              aria-describedby={zoekFout ? 'zoek-fout' : undefined}
              aria-invalid={zoekFout ? true : undefined}
            />
          </div>
          <Knop type="submit" variant="secundair" icoon={Search} disabled={zoeken}>
            Zoeken
          </Knop>
        </form>
        {zoekFout && (
          <span id="zoek-fout" className="veld__fout" role="alert">
            {zoekFout}
          </span>
        )}
      </Kaart>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <h2 style={{ marginBottom: 'var(--space-4)' }}>Mijn ingediende tickets</h2>
        {mijn.laden ? (
          <Laden />
        ) : mijn.fout ? (
          <Melding variant="aandacht" titel="Laden mislukt">
            {mijn.fout}
          </Melding>
        ) : (
          <TicketLijst
            tickets={mijn.data ?? []}
            teams={teams}
            titel="Mijn ingediende tickets"
            legeTekst="Je hebt nog geen tickets ingediend. Heb je een vraag? Maak een nieuw ticket aan."
            toonBijgewerkt
          />
        )}
      </div>
    </>
  );
}
