import { ArrowLeft, Ban, Lock, MessageSquare, Save, SearchX, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PrioriteitBadge, StatusBadge, VertrouwelijkBadge } from '../components/TicketBadges';
import { Badge, Kaart, Keuzelijst, Knop, Laden, Leeg, Melding, Schakelaar, Tekstvak } from '../components/ui';
import { teamNaam, useAuth } from '../lib/auth';
import { datumTijd, foutTekst, PRIORITEIT_LABEL, PRIORITEITEN, STATUS_LABEL, STATUSSEN } from '../lib/format';
import { useData, useTicketUpdates } from '../lib/hooks';
import { ok, supabase } from '../lib/supabase';
import type { Prioriteit, Reactie, Status, Ticket } from '../lib/types';

interface Gegevens {
  ticket: Ticket | null;
  reacties: Reactie[];
  indienerEmail: string | null;
}

export function TicketDetailPagina() {
  const { nummer = '' } = useParams();
  const { profiel, teams, handlerTeams } = useAuth();
  const nr = decodeURIComponent(nummer).toUpperCase();

  const data = useData<Gegevens>(async () => {
    const t = ok(await supabase.from('tickets').select('*').eq('number', nr).maybeSingle()) as Ticket | null;
    if (!t) return { ticket: null, reacties: [], indienerEmail: null };
    const magGesprek = handlerTeams.has(t.team_id) || t.submitter_id === profiel?.id;
    const reacties = magGesprek
      ? (ok(
          await supabase
            .from('ticket_comments')
            .select('id, ticket_id, author_id, author_name, body, internal, created_at')
            .eq('ticket_id', t.id)
            .order('created_at'),
        ) as Reactie[])
      : [];
    let indienerEmail: string | null = null;
    if (handlerTeams.has(t.team_id)) {
      const p = await supabase.from('profiles').select('email').eq('id', t.submitter_id).maybeSingle();
      indienerEmail = (p.data?.email as string | undefined) ?? null;
    }
    return { ticket: t, reacties, indienerEmail };
  }, `ticket-${nr}-${[...handlerTeams].join(',')}`);
  useTicketUpdates(data.herlaad);

  if (data.laden) return <Laden tekst="Ticket laden..." />;
  if (data.fout) {
    return (
      <Melding variant="aandacht" titel="Laden mislukt">
        {data.fout}
      </Melding>
    );
  }

  const ticket = data.data?.ticket;
  if (!ticket) {
    return (
      <Kaart>
        <Leeg icoon={SearchX} titel="Ticket niet gevonden">
          Er is geen ticket met nummer {nr} dat jij kunt bekijken.
        </Leeg>
        <div className="rij" style={{ justifyContent: 'center' }}>
          <Link to="/" className="knop knop--rand">
            Naar mijn tickets
          </Link>
        </div>
      </Kaart>
    );
  }

  const isHandler = handlerTeams.has(ticket.team_id);
  const isIndiener = ticket.submitter_id === profiel?.id;

  return (
    <>
      <Link to={isHandler ? '/dashboard' : isIndiener ? '/' : '/tickets'} className="knop knop--spook knop--sm" style={{ marginBottom: 'var(--space-4)' }}>
        <ArrowLeft size={16} aria-hidden="true" />
        Terug
      </Link>

      <div className="detail-raster">
        <div className="stapel stapel--groot">
          <Kaart>
            <div className="stapel">
              <div className="rij">
                <span className="ticketnummer">{ticket.number}</span>
                <StatusBadge status={ticket.status} />
                <PrioriteitBadge prioriteit={ticket.priority} />
                {ticket.confidential && <VertrouwelijkBadge />}
                {!isHandler && !isIndiener && <Badge variant="rand">Alleen lezen</Badge>}
              </div>
              <h1>{ticket.subject}</h1>
              <p className="omschrijving">{ticket.description}</p>
            </div>
          </Kaart>

          <Gesprek
            ticket={ticket}
            reacties={data.data?.reacties ?? []}
            isHandler={isHandler}
            isIndiener={isIndiener}
            naGeplaatst={data.herlaad}
          />
        </div>

        <div className="stapel stapel--groot">
          <Kaart variant="compact" aria-label="Gegevens">
            <dl className="dl">
              <dt>Team</dt>
              <dd>{teamNaam(teams, ticket.team_id)}</dd>
              <dt>Ingediend door</dt>
              <dd>
                {ticket.submitter_name}
                {data.data?.indienerEmail && (
                  <>
                    <br />
                    <a href={`mailto:${data.data.indienerEmail}?subject=${encodeURIComponent(`${ticket.number}: ${ticket.subject}`)}`}>
                      {data.data.indienerEmail}
                    </a>
                  </>
                )}
              </dd>
              <dt>Ingediend</dt>
              <dd>
                <time dateTime={ticket.created_at}>{datumTijd(ticket.created_at)}</time>
              </dd>
              <dt>Bijgewerkt</dt>
              <dd>
                <time dateTime={ticket.updated_at}>{datumTijd(ticket.updated_at)}</time>
              </dd>
              {ticket.closed_at && (
                <>
                  <dt>Gesloten</dt>
                  <dd>
                    <time dateTime={ticket.closed_at}>{datumTijd(ticket.closed_at)}</time>
                  </dd>
                </>
              )}
            </dl>
          </Kaart>

          {isHandler && <Behandelen key={ticket.updated_at} ticket={ticket} naOpslaan={data.herlaad} />}
          {isIndiener && !isHandler && ticket.status === 'open' && <Annuleren ticket={ticket} naAnnuleren={data.herlaad} />}
        </div>
      </div>
    </>
  );
}

function Behandelen({ ticket, naOpslaan }: { ticket: Ticket; naOpslaan: () => void }) {
  const [status, setStatus] = useState<Status>(ticket.status);
  const [prioriteit, setPrioriteit] = useState<Prioriteit>(ticket.priority);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: 'positief' | 'aandacht'; tekst: string } | null>(null);
  const gewijzigd = status !== ticket.status || prioriteit !== ticket.priority;

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setMelding(null);
    const { data, error } = await supabase.from('tickets').update({ status, priority: prioriteit }).eq('id', ticket.id).select('id');
    setBezig(false);
    if (error || !data || data.length === 0) {
      setMelding({ soort: 'aandacht', tekst: error ? foutTekst(error) : 'Opslaan is niet gelukt. Je hebt mogelijk geen rechten meer.' });
      return;
    }
    setMelding({ soort: 'positief', tekst: 'Opgeslagen.' });
    naOpslaan();
  }

  return (
    <Kaart variant="compact" aria-labelledby="behandelen-titel">
      <form className="stapel" onSubmit={opslaan}>
        <h2 id="behandelen-titel">Behandelen</h2>
        {melding && <Melding variant={melding.soort}>{melding.tekst}</Melding>}
        <Keuzelijst label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {STATUSSEN.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Keuzelijst>
        <Keuzelijst label="Prioriteit" value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as Prioriteit)}>
          {PRIORITEITEN.map((p) => (
            <option key={p} value={p}>
              {PRIORITEIT_LABEL[p]}
            </option>
          ))}
        </Keuzelijst>
        <Knop type="submit" variant="secundair" icoon={Save} disabled={bezig || !gewijzigd}>
          {bezig ? 'Bezig...' : 'Opslaan'}
        </Knop>
      </form>
    </Kaart>
  );
}

function Annuleren({ ticket, naAnnuleren }: { ticket: Ticket; naAnnuleren: () => void }) {
  const [bevestig, setBevestig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function annuleer() {
    setBezig(true);
    const { data, error } = await supabase.from('tickets').update({ status: 'geannuleerd' }).eq('id', ticket.id).select('id');
    setBezig(false);
    if (error || !data || data.length === 0) {
      setFout(error ? foutTekst(error) : 'Annuleren kan niet meer: het ticket is al opgepakt.');
      return;
    }
    naAnnuleren();
  }

  return (
    <Kaart variant="compact" aria-label="Ticket annuleren">
      <div className="stapel">
        <p className="klein muted">Heb je je antwoord al, of was de vraag niet meer nodig? Zolang het ticket open is kun je het annuleren.</p>
        {fout && <Melding variant="aandacht">{fout}</Melding>}
        {bevestig ? (
          <div className="rij">
            <Knop variant="secundair" klein icoon={Ban} onClick={() => void annuleer()} disabled={bezig}>
              Ja, annuleren
            </Knop>
            <Knop variant="spook" klein onClick={() => setBevestig(false)}>
              Nee
            </Knop>
          </div>
        ) : (
          <Knop variant="rand" klein icoon={Ban} onClick={() => setBevestig(true)}>
            Ticket annuleren
          </Knop>
        )}
      </div>
    </Kaart>
  );
}

function Gesprek({
  ticket,
  reacties,
  isHandler,
  isIndiener,
  naGeplaatst,
}: {
  ticket: Ticket;
  reacties: Reactie[];
  isHandler: boolean;
  isIndiener: boolean;
  naGeplaatst: () => void;
}) {
  const [tekst, setTekst] = useState('');
  // Voor behandelaars staat "intern" standaard aan: liever per ongeluk intern dan per ongeluk naar de indiener.
  const [intern, setIntern] = useState(isHandler && !isIndiener);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  if (!isHandler && !isIndiener) {
    return (
      <Kaart variant="zacht" aria-label="Reacties">
        <p className="klein">Reacties op dit ticket zijn alleen zichtbaar voor de indiener en het team.</p>
      </Kaart>
    );
  }

  async function plaats(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!tekst.trim()) {
      setFout('Schrijf eerst je reactie.');
      return;
    }
    setBezig(true);
    const { error } = await supabase
      .from('ticket_comments')
      .insert({ ticket_id: ticket.id, body: tekst.trim(), internal: isHandler ? intern : false });
    setBezig(false);
    if (error) {
      setFout(foutTekst(error));
      return;
    }
    setTekst('');
    naGeplaatst();
  }

  return (
    <Kaart aria-labelledby="gesprek-titel">
      <div className="stapel">
        <h2 id="gesprek-titel">Reacties</h2>
        {reacties.length === 0 ? (
          <p className="muted klein">Nog geen reacties.</p>
        ) : (
          <ol className="reacties" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {reacties.map((r) => (
              <li key={r.id} className={`reactie ${r.internal ? 'reactie--intern' : ''}`}>
                <div className="reactie__kop">
                  <span className="rij" style={{ gap: 'var(--space-2)' }}>
                    <span className="reactie__auteur">{r.author_name}</span>
                    {r.internal && (
                      <Badge variant="aandacht">
                        <Lock size={11} aria-hidden="true" />
                        Interne notitie
                      </Badge>
                    )}
                  </span>
                  <time dateTime={r.created_at}>{datumTijd(r.created_at)}</time>
                </div>
                <p className="reactie__tekst">{r.body}</p>
              </li>
            ))}
          </ol>
        )}

        <hr className="scheiding" />

        <form className="stapel" onSubmit={plaats} noValidate>
          {fout && <Melding variant="aandacht">{fout}</Melding>}
          <Tekstvak
            label={isHandler && intern ? 'Interne notitie' : isHandler ? 'Reactie aan de indiener' : 'Je reactie'}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            maxLength={5000}
            rows={4}
            hulp="Deel geen wachtwoorden of vertrouwelijke gegevens. Stuur gegevens per e-mail."
          />
          {isHandler && (
            <Schakelaar
              label="Interne notitie"
              checked={intern}
              onChange={setIntern}
              uitleg={intern ? 'Alleen zichtbaar voor behandelaars van dit team.' : 'Let op: de indiener ziet deze reactie.'}
            />
          )}
          <div>
            <Knop type="submit" variant={intern && isHandler ? 'secundair' : 'primair'} icoon={intern && isHandler ? MessageSquare : Send} disabled={bezig}>
              {bezig ? 'Bezig...' : intern && isHandler ? 'Notitie opslaan' : 'Reactie versturen'}
            </Knop>
          </div>
        </form>
      </div>
    </Kaart>
  );
}
