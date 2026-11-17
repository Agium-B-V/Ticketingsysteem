import { ChevronDown, ChevronUp, KeyRound, Power, Search, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { TijdelijkWachtwoord } from '../../components/TijdelijkWachtwoord';
import { Badge, Invoer, Kaart, Keuzelijst, Knop, Laden, Leeg, Melding } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { foutTekst, ROL_LABEL } from '../../lib/format';
import { roepFunctieAan, type AangemaaktAccount } from '../../lib/functies';
import { useData } from '../../lib/hooks';
import { ok, supabase } from '../../lib/supabase';
import type { Lidmaatschap, Profiel, Team, TeamRol } from '../../lib/types';
import { CsvImport } from './CsvImport';

interface Gegevens {
  profielen: Profiel[];
  leden: Lidmaatschap[];
}

type RolKeuze = TeamRol | '';

export function BeheerGebruikers() {
  const { teams } = useAuth();
  const [zoek, setZoek] = useState('');
  const [toonNieuw, setToonNieuw] = useState(false);
  const [toonImport, setToonImport] = useState(false);
  const [wachtwoord, setWachtwoord] = useState<{ naam?: string; email: string; wachtwoord: string } | null>(null);

  const data = useData<Gegevens>(async () => {
    const [p, l] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, active, must_change_password, created_at').order('full_name'),
      supabase.from('team_members').select('team_id, user_id, role'),
    ]);
    return { profielen: ok(p) as Profiel[], leden: ok(l) as Lidmaatschap[] };
  }, 'gebruikers');

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (data.data?.profielen ?? []).filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.email.includes(q));
  }, [data.data, zoek]);

  return (
    <div className="stapel stapel--groot">
      {wachtwoord && <TijdelijkWachtwoord {...wachtwoord} onSluit={() => setWachtwoord(null)} />}

      <div className="rij">
        <Knop icoon={UserPlus} onClick={() => setToonNieuw((v) => !v)} aria-expanded={toonNieuw}>
          Gebruiker toevoegen
        </Knop>
        <Knop variant="rand" icoon={Users} onClick={() => setToonImport((v) => !v)} aria-expanded={toonImport}>
          Importeren uit CSV
        </Knop>
      </div>

      {toonNieuw && (
        <NieuweGebruiker
          teams={teams}
          onAangemaakt={(a, naam) => {
            setWachtwoord({ naam, email: a.email, wachtwoord: a.temp_password });
            setToonNieuw(false);
            data.herlaad();
          }}
        />
      )}

      {toonImport && <CsvImport naImport={data.herlaad} />}

      <Kaart variant="vlak" aria-label="Gebruikers">
        <div style={{ padding: 'var(--space-4)' }}>
          <div className="veld" style={{ maxWidth: 360 }}>
            <label className="veld__label" htmlFor="zoek-gebruiker">
              Zoeken op naam of e-mail
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 13, color: 'var(--gray-500)' }} />
              <input id="zoek-gebruiker" className="invoer" style={{ paddingLeft: 36 }} value={zoek} onChange={(e) => setZoek(e.target.value)} />
            </div>
          </div>
        </div>
        {data.laden ? (
          <Laden />
        ) : data.fout ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Melding variant="aandacht">{data.fout}</Melding>
          </div>
        ) : gefilterd.length === 0 ? (
          <Leeg icoon={Users} titel="Geen gebruikers gevonden" />
        ) : (
          <div className="tabel-wrap">
            <table className="tabel">
              <caption className="sr-only">Gebruikers</caption>
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>E-mail</th>
                  <th>Teams en rol</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Acties</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((p) => (
                  <GebruikerRij
                    key={p.id}
                    profiel={p}
                    teams={teams}
                    leden={(data.data?.leden ?? []).filter((l) => l.user_id === p.id)}
                    naWijziging={data.herlaad}
                    toonWachtwoord={(w) => setWachtwoord({ naam: p.full_name, email: p.email, wachtwoord: w })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>
    </div>
  );
}

function NieuweGebruiker({ teams, onAangemaakt }: { teams: Team[]; onAangemaakt: (a: AangemaaktAccount, naam: string) => void }) {
  const [naam, setNaam] = useState('');
  const [email, setEmail] = useState('');
  const [rollen, setRollen] = useState<Record<string, RolKeuze>>({});
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function maak(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    const f: Record<string, string> = {};
    if (!naam.trim()) f.naam = 'Vul de volledige naam in.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) f.email = 'Vul een geldig e-mailadres in.';
    setFouten(f);
    if (Object.keys(f).length > 0) return;
    setBezig(true);
    try {
      const memberships = Object.entries(rollen)
        .filter(([, r]) => r)
        .map(([team_id, role]) => ({ team_id, role }));
      const res = await roepFunctieAan<AangemaaktAccount>('admin-create-user', {
        email: email.trim().toLowerCase(),
        full_name: naam.trim(),
        memberships,
      });
      onAangemaakt(res, naam.trim());
    } catch (err) {
      setFout(foutTekst(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <Kaart aria-labelledby="nieuwe-gebruiker">
      <form className="stapel" onSubmit={maak} noValidate>
        <h2 id="nieuwe-gebruiker">Gebruiker toevoegen</h2>
        <p className="muted klein">Alleen e-mailadressen van het bedrijfsdomein worden geaccepteerd. Je krijgt daarna één keer een tijdelijk wachtwoord te zien.</p>
        {fout && <Melding variant="aandacht">{fout}</Melding>}
        <div className="raster-2">
          <Invoer label="Volledige naam" value={naam} onChange={(e) => setNaam(e.target.value)} fout={fouten.naam} maxLength={120} required />
          <Invoer
            label="E-mailadres"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fout={fouten.email}
            autoComplete="off"
            required
          />
        </div>
        <fieldset className="stapel" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="veld__label" style={{ marginBottom: 'var(--space-2)' }}>
            Teamrollen (optioneel; zonder rol is iemand medewerker)
          </legend>
          <div className="filters" style={{ marginBottom: 0 }}>
            {teams
              .filter((t) => t.active)
              .map((t) => (
                <Keuzelijst key={t.id} label={t.name} value={rollen[t.id] ?? ''} onChange={(e) => setRollen({ ...rollen, [t.id]: e.target.value as RolKeuze })}>
                  <option value="">Geen rol</option>
                  <option value="handler">{ROL_LABEL.handler}</option>
                  <option value="admin">{ROL_LABEL.admin}</option>
                </Keuzelijst>
              ))}
          </div>
        </fieldset>
        <div>
          <Knop type="submit" icoon={UserPlus} disabled={bezig}>
            {bezig ? 'Bezig met aanmaken...' : 'Account aanmaken'}
          </Knop>
        </div>
      </form>
    </Kaart>
  );
}

function GebruikerRij({
  profiel,
  teams,
  leden,
  naWijziging,
  toonWachtwoord,
}: {
  profiel: Profiel;
  teams: Team[];
  leden: Lidmaatschap[];
  naWijziging: () => void;
  toonWachtwoord: (w: string) => void;
}) {
  const { profiel: ik } = useAuth();
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ soort: 'positief' | 'aandacht'; tekst: string } | null>(null);
  const [bevestig, setBevestig] = useState<'reset' | 'actief' | null>(null);
  const zelf = ik?.id === profiel.id;

  async function actie(fn: () => Promise<void>) {
    setBezig(true);
    setMelding(null);
    try {
      await fn();
    } catch (err) {
      setMelding({ soort: 'aandacht', tekst: foutTekst(err) });
    } finally {
      setBezig(false);
      setBevestig(null);
    }
  }

  const reset = () =>
    actie(async () => {
      const r = await roepFunctieAan<{ temp_password: string }>('admin-reset-password', { user_id: profiel.id });
      toonWachtwoord(r.temp_password);
      naWijziging();
    });

  const zetActief = () =>
    actie(async () => {
      await roepFunctieAan('admin-set-active', { user_id: profiel.id, active: !profiel.active });
      naWijziging();
    });

  const zetRol = (teamId: string, rol: RolKeuze) =>
    actie(async () => {
      const bestaand = leden.find((l) => l.team_id === teamId);
      if (!rol && bestaand) {
        const r = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', profiel.id).select('user_id');
        if (r.error) throw new Error(r.error.message);
        if (!r.data?.length) throw new Error('Verwijderen is niet gelukt.');
      } else if (rol && bestaand) {
        const r = await supabase.from('team_members').update({ role: rol }).eq('team_id', teamId).eq('user_id', profiel.id).select('user_id');
        if (r.error) throw new Error(r.error.message);
        if (!r.data?.length) throw new Error('Wijzigen is niet gelukt.');
      } else if (rol) {
        const r = await supabase.from('team_members').insert({ team_id: teamId, user_id: profiel.id, role: rol });
        if (r.error) throw new Error(r.error.message);
      }
      setMelding({ soort: 'positief', tekst: 'Teamrol bijgewerkt.' });
      naWijziging();
    });

  return (
    <>
      <tr>
        <td>
          <strong style={{ color: 'var(--agium-navy)' }}>{profiel.full_name}</strong>
          {zelf && <span className="muted klein"> (jij)</span>}
        </td>
        <td className="muted">{profiel.email}</td>
        <td>
          <span className="rij" style={{ gap: 'var(--space-1)' }}>
            {leden.length === 0 ? (
              <span className="muted klein">Medewerker</span>
            ) : (
              leden.map((l) => (
                <Badge key={l.team_id} variant={l.role === 'admin' ? 'solide' : 'info'}>
                  {teams.find((t) => t.id === l.team_id)?.prefix ?? '?'}: {ROL_LABEL[l.role]}
                </Badge>
              ))
            )}
          </span>
        </td>
        <td>
          {!profiel.active ? (
            <Badge variant="rand">Gedeactiveerd</Badge>
          ) : profiel.must_change_password ? (
            <Badge variant="aandacht">Wacht op eerste login</Badge>
          ) : (
            <Badge variant="positief">Actief</Badge>
          )}
        </td>
        <td>
          <Knop
            variant="spook"
            klein
            icoon={open ? ChevronUp : ChevronDown}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`beheer-${profiel.id}`}
          >
            Beheren
          </Knop>
        </td>
      </tr>
      {open && (
        <tr id={`beheer-${profiel.id}`}>
          <td colSpan={5} style={{ background: 'var(--gray-50)' }}>
            <div className="stapel" style={{ padding: 'var(--space-2) 0' }}>
              {melding && <Melding variant={melding.soort}>{melding.tekst}</Melding>}
              <div className="filters" style={{ marginBottom: 0 }}>
                {teams.map((t) => (
                  <Keuzelijst
                    key={t.id}
                    label={`${t.name}${t.active ? '' : ' (inactief)'}`}
                    value={leden.find((l) => l.team_id === t.id)?.role ?? ''}
                    disabled={bezig}
                    onChange={(e) => void zetRol(t.id, e.target.value as RolKeuze)}
                  >
                    <option value="">Geen rol</option>
                    <option value="handler">{ROL_LABEL.handler}</option>
                    <option value="admin">{ROL_LABEL.admin}</option>
                  </Keuzelijst>
                ))}
              </div>
              <div className="rij">
                {bevestig === 'reset' ? (
                  <>
                    <span className="klein">Nieuw tijdelijk wachtwoord instellen? Het huidige wachtwoord werkt dan niet meer.</span>
                    <Knop variant="secundair" klein disabled={bezig} onClick={() => void reset()}>
                      Ja, resetten
                    </Knop>
                    <Knop variant="spook" klein onClick={() => setBevestig(null)}>
                      Annuleren
                    </Knop>
                  </>
                ) : bevestig === 'actief' ? (
                  <>
                    <span className="klein">
                      {profiel.active ? 'Deactiveren? De gebruiker heeft direct nergens meer toegang. Tickets blijven bestaan.' : 'Weer activeren?'}
                    </span>
                    <Knop variant="secundair" klein disabled={bezig} onClick={() => void zetActief()}>
                      {profiel.active ? 'Ja, deactiveren' : 'Ja, activeren'}
                    </Knop>
                    <Knop variant="spook" klein onClick={() => setBevestig(null)}>
                      Annuleren
                    </Knop>
                  </>
                ) : (
                  <>
                    <Knop variant="rand" klein icoon={KeyRound} disabled={bezig} onClick={() => setBevestig('reset')}>
                      Wachtwoord resetten
                    </Knop>
                    {!zelf && (
                      <Knop variant="rand" klein icoon={Power} disabled={bezig} onClick={() => setBevestig('actief')}>
                        {profiel.active ? 'Deactiveren' : 'Heractiveren'}
                      </Knop>
                    )}
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
