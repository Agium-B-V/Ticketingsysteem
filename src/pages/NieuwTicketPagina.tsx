import { Lock, Send, Ticket } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Invoer, Kaart, Keuzelijst, Knop, Melding, PaginaKop, Schakelaar, Tekstvak } from '../components/ui';
import { useAuth } from '../lib/auth';
import { foutTekst, PRIORITEIT_LABEL, PRIORITEITEN } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Prioriteit } from '../lib/types';

export function NieuwTicketPagina() {
  const { profiel, teams } = useAuth();
  const actieveTeams = teams.filter((t) => t.active);
  const [naam, setNaam] = useState(profiel?.full_name ?? '');
  const [team, setTeam] = useState('');
  const [onderwerp, setOnderwerp] = useState('');
  const [omschrijving, setOmschrijving] = useState('');
  const [prioriteit, setPrioriteit] = useState<Prioriteit>('midden');
  const [vertrouwelijk, setVertrouwelijk] = useState(false);
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [ingediend, setIngediend] = useState<string | null>(null);

  const gekozenTeam = actieveTeams.find((t) => t.id === team);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const f: Record<string, string> = {};
    if (!naam.trim()) f.naam = 'Vul je naam in.';
    if (!team) f.team = 'Kies het team dat je vraag moet oppakken.';
    if (!onderwerp.trim()) f.onderwerp = 'Geef je vraag een kort onderwerp.';
    else if (onderwerp.trim().length > 200) f.onderwerp = 'Maximaal 200 tekens.';
    if (!omschrijving.trim()) f.omschrijving = 'Beschrijf je vraag.';
    else if (omschrijving.trim().length > 10000) f.omschrijving = 'Maximaal 10.000 tekens.';
    setFouten(f);
    if (Object.keys(f).length > 0 || !profiel) return;

    setBezig(true);
    const { data, error } = await supabase
      .from('tickets')
      .insert({
        team_id: team,
        submitter_id: profiel.id,
        submitter_name: naam.trim(),
        subject: onderwerp.trim(),
        description: omschrijving.trim(),
        priority: prioriteit,
        confidential: vertrouwelijk,
      })
      .select('number')
      .single();
    setBezig(false);
    if (error) {
      setFout(foutTekst(error));
      return;
    }
    setIngediend(data.number as string);
  }

  function nogEen() {
    setIngediend(null);
    setOnderwerp('');
    setOmschrijving('');
    setPrioriteit('midden');
    setVertrouwelijk(false);
    setFouten({});
  }

  if (ingediend) {
    return (
      <div className="container--smal" style={{ margin: '0 auto' }}>
        <Kaart variant="zacht">
          <div className="stapel">
            <span className="eyebrow">Ticket ingediend</span>
            <h1>
              Je ticketnummer is <span className="ticketnummer">{ingediend}</span>
            </h1>
            <p>We hebben je vraag ontvangen. Je volgt de status en reacties via Mijn tickets.</p>
            <div className="rij">
              <Link className="knop knop--secundair" to={`/tickets/${encodeURIComponent(ingediend)}`}>
                Bekijk ticket
              </Link>
              <Knop variant="rand" onClick={nogEen}>
                Nog een vraag stellen
              </Knop>
            </div>
          </div>
        </Kaart>
      </div>
    );
  }

  return (
    <div className="container--smal" style={{ margin: '0 auto' }}>
      <PaginaKop eyebrow="Nieuw ticket" titel="Stel je vraag">
        In een minuut ingevuld. Het team pakt je vraag zo snel mogelijk op.
      </PaginaKop>
      <Kaart>
        <form className="stapel stapel--groot" onSubmit={verstuur} noValidate>
          <Melding variant="info" titel="Wie ziet je ticket?">
            Een gewoon ticket is zichtbaar voor alle collega's (zonder de reacties). Is dat niet de bedoeling, zet dan
            &quot;Vertrouwelijk&quot; aan.
          </Melding>
          {fout && <Melding variant="aandacht">{fout}</Melding>}

          <div className="raster-2">
            <Invoer label="Je naam" value={naam} onChange={(e) => setNaam(e.target.value)} fout={fouten.naam} maxLength={120} required />
            <Keuzelijst label="Team" value={team} onChange={(e) => setTeam(e.target.value)} fout={fouten.team} required>
              <option value="">Kies een team</option>
              {actieveTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Keuzelijst>
          </div>

          <Invoer
            label="Onderwerp"
            value={onderwerp}
            onChange={(e) => setOnderwerp(e.target.value)}
            fout={fouten.onderwerp}
            maxLength={200}
            placeholder="Bijvoorbeeld: Declaratie reiskosten oktober"
            required
          />
          <Tekstvak
            label="Omschrijving"
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            fout={fouten.omschrijving}
            maxLength={10000}
            rows={6}
            hulp="Zet geen wachtwoorden of andere geheime gegevens in je vraag. Antwoorden met gegevens gaan per e-mail."
            required
          />

          <fieldset className="radiogroep" aria-describedby="prio-hulp">
            <legend className="veld__label">Prioriteit</legend>
            {PRIORITEITEN.map((p) => (
              <label key={p} className="radiokeuze">
                <input type="radio" name="prioriteit" value={p} checked={prioriteit === p} onChange={() => setPrioriteit(p)} />
                <span>{PRIORITEIT_LABEL[p]}</span>
              </label>
            ))}
            <span id="prio-hulp" className="veld__hulp" style={{ width: '100%' }}>
              Hoog is voor vragen die vandaag nog moeten.
            </span>
          </fieldset>

          <Schakelaar
            label="Vertrouwelijk"
            checked={vertrouwelijk}
            onChange={setVertrouwelijk}
            uitleg={
              <>
                Alleen jij en de behandelaars van {gekozenTeam ? gekozenTeam.name : 'het gekozen team'} zien dit ticket. Collega's zien niet
                dat het bestaat.
              </>
            }
          />

          <div className="rij">
            <Knop type="submit" icoon={vertrouwelijk ? Lock : Send} disabled={bezig}>
              {bezig ? 'Bezig met versturen...' : vertrouwelijk ? 'Vertrouwelijk versturen' : 'Ticket versturen'}
            </Knop>
            <Link to="/" className="knop knop--spook">
              <Ticket size={18} aria-hidden="true" />
              Naar mijn tickets
            </Link>
          </div>
        </form>
      </Kaart>
    </div>
  );
}
