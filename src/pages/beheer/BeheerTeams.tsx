import { Plus, Power, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Invoer, Kaart, Knop, Melding } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { datum, foutTekst } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Team } from '../../lib/types';

export function BeheerTeams() {
  const { teams, herlaad } = useAuth();
  const [naam, setNaam] = useState('');
  const [prefix, setPrefix] = useState('');
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const [melding, setMelding] = useState<{ soort: 'positief' | 'aandacht'; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);

  async function voegToe(e: FormEvent) {
    e.preventDefault();
    setMelding(null);
    const p = prefix.trim().toUpperCase();
    const f: Record<string, string> = {};
    if (!naam.trim()) f.naam = 'Vul een naam in.';
    if (!/^[A-Z]{2,6}$/.test(p)) f.prefix = 'Gebruik 2 tot 6 hoofdletters, bijvoorbeeld HR.';
    else if (teams.some((t) => t.prefix === p)) f.prefix = 'Deze prefix bestaat al.';
    setFouten(f);
    if (Object.keys(f).length > 0) return;
    setBezig(true);
    const { error } = await supabase.from('teams').insert({ name: naam.trim(), prefix: p, active: true });
    setBezig(false);
    if (error) {
      setMelding({ soort: 'aandacht', tekst: /duplicate|unique/i.test(error.message) ? 'Een team met deze naam of prefix bestaat al.' : foutTekst(error) });
      return;
    }
    setNaam('');
    setPrefix('');
    setMelding({ soort: 'positief', tekst: `Team ${naam.trim()} (${p}) is toegevoegd.` });
    await herlaad();
  }

  return (
    <div className="stapel stapel--groot">
      <Kaart aria-labelledby="team-toevoegen">
        <form className="stapel" onSubmit={voegToe} noValidate>
          <h2 id="team-toevoegen">Team toevoegen</h2>
          <p className="muted klein">De prefix komt voor elk ticketnummer (bijvoorbeeld HR-0001) en kan later niet meer worden gewijzigd.</p>
          {melding && <Melding variant={melding.soort}>{melding.tekst}</Melding>}
          <div className="raster-2">
            <Invoer label="Naam" value={naam} onChange={(e) => setNaam(e.target.value)} fout={fouten.naam} maxLength={80} required />
            <Invoer
              label="Prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              fout={fouten.prefix}
              maxLength={6}
              hulp="2 tot 6 hoofdletters"
              required
            />
          </div>
          <div>
            <Knop type="submit" icoon={Plus} disabled={bezig}>
              Team toevoegen
            </Knop>
          </div>
        </form>
      </Kaart>

      <Kaart variant="vlak" aria-label="Teams">
        <div className="tabel-wrap">
          <table className="tabel">
            <caption className="sr-only">Teams</caption>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Prefix</th>
                <th>Status</th>
                <th>Aangemaakt</th>
                <th>
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <TeamRij key={`${t.id}-${t.name}-${t.active}`} team={t} naWijziging={herlaad} />
              ))}
            </tbody>
          </table>
        </div>
      </Kaart>
    </div>
  );
}

function TeamRij({ team, naWijziging }: { team: Team; naWijziging: () => Promise<void> }) {
  const [naam, setNaam] = useState(team.name);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function wijzig(waarden: Partial<Pick<Team, 'name' | 'active'>>) {
    setFout(null);
    setBezig(true);
    const { data, error } = await supabase.from('teams').update(waarden).eq('id', team.id).select('id');
    setBezig(false);
    if (error || !data?.length) {
      setFout(error ? foutTekst(error) : 'Wijzigen is niet gelukt.');
      return;
    }
    await naWijziging();
  }

  return (
    <tr>
      <td>
        <label className="sr-only" htmlFor={`naam-${team.id}`}>
          Naam van team {team.prefix}
        </label>
        <div className="rij" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
          <input id={`naam-${team.id}`} className="invoer" value={naam} maxLength={80} onChange={(e) => setNaam(e.target.value)} style={{ minWidth: 140 }} />
          {naam.trim() !== team.name && naam.trim() && (
            <Knop variant="rand" klein alleenIcoon icoon={Save} aria-label="Naam opslaan" disabled={bezig} onClick={() => void wijzig({ name: naam.trim() })} />
          )}
        </div>
        {fout && (
          <span className="veld__fout" role="alert">
            {fout}
          </span>
        )}
      </td>
      <td className="ticketnummer">{team.prefix}</td>
      <td>
        <span className="rij" style={{ gap: 'var(--space-2)' }}>
          {team.active ? <Badge variant="positief">Actief</Badge> : <Badge variant="rand">Inactief</Badge>}
          {team.is_admin_team && <Badge variant="info">Beheerteam</Badge>}
        </span>
      </td>
      <td className="muted">{datum(team.created_at)}</td>
      <td>
        {!team.is_admin_team && (
          <Knop variant="rand" klein icoon={Power} disabled={bezig} onClick={() => void wijzig({ active: !team.active })}>
            {team.active ? 'Deactiveren' : 'Activeren'}
          </Knop>
        )}
      </td>
    </tr>
  );
}
