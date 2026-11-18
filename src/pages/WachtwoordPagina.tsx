import { KeyRound, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Invoer, Kaart, Knop, Melding, PaginaKop } from '../components/ui';
import { useAuth } from '../lib/auth';
import { foutTekst } from '../lib/format';
import { supabase } from '../lib/supabase';

const MIN = 12;

export function WachtwoordPagina() {
  const { profiel, herlaad, uitloggen } = useAuth();
  const navigate = useNavigate();
  const verplicht = profiel?.must_change_password ?? false;
  const [huidig, setHuidig] = useState('');
  const [nieuw, setNieuw] = useState('');
  const [herhaal, setHerhaal] = useState('');
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const [melding, setMelding] = useState<{ soort: 'positief' | 'aandacht'; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setMelding(null);
    const f: Record<string, string> = {};
    if (!huidig) f.huidig = 'Vul je huidige wachtwoord in.';
    if (nieuw.length < MIN) f.nieuw = `Gebruik minimaal ${MIN} tekens.`;
    else if (nieuw === huidig) f.nieuw = 'Kies een ander wachtwoord dan je huidige.';
    if (herhaal !== nieuw) f.herhaal = 'De wachtwoorden zijn niet gelijk.';
    setFouten(f);
    if (Object.keys(f).length > 0 || !profiel) return;

    setBezig(true);
    try {
      // Controleer het huidige wachtwoord voordat het wordt gewijzigd.
      const check = await supabase.auth.signInWithPassword({ email: profiel.email, password: huidig });
      if (check.error) {
        setFouten({ huidig: 'Je huidige wachtwoord klopt niet.' });
        return;
      }
      const upd = await supabase.auth.updateUser({ password: nieuw });
      if (upd.error) throw upd.error;
      if (verplicht) {
        const mark = await supabase.rpc('mark_password_changed');
        if (mark.error) throw mark.error;
      }
      setHuidig('');
      setNieuw('');
      setHerhaal('');
      await herlaad();
      if (verplicht) navigate('/', { replace: true });
      else setMelding({ soort: 'positief', tekst: 'Je wachtwoord is gewijzigd.' });
    } catch (err) {
      setMelding({ soort: 'aandacht', tekst: foutTekst(err) });
    } finally {
      setBezig(false);
    }
  }

  const formulier = (
    <Kaart>
      <form className="stapel" onSubmit={verstuur} noValidate>
        {melding && <Melding variant={melding.soort}>{melding.tekst}</Melding>}
        <Invoer
          label={verplicht ? 'Tijdelijk wachtwoord' : 'Huidig wachtwoord'}
          type="password"
          autoComplete="current-password"
          value={huidig}
          onChange={(e) => setHuidig(e.target.value)}
          fout={fouten.huidig}
          required
        />
        <Invoer
          label="Nieuw wachtwoord"
          type="password"
          autoComplete="new-password"
          value={nieuw}
          onChange={(e) => setNieuw(e.target.value)}
          hulp={`Minimaal ${MIN} tekens. Een zin van een paar woorden werkt goed en is makkelijk te onthouden.`}
          fout={fouten.nieuw}
          minLength={MIN}
          required
        />
        <Invoer
          label="Herhaal nieuw wachtwoord"
          type="password"
          autoComplete="new-password"
          value={herhaal}
          onChange={(e) => setHerhaal(e.target.value)}
          fout={fouten.herhaal}
          required
        />
        <div className="rij">
          <Knop type="submit" icoon={KeyRound} disabled={bezig}>
            {bezig ? 'Bezig...' : 'Wachtwoord opslaan'}
          </Knop>
          {verplicht && (
            <Knop variant="spook" icoon={LogOut} onClick={() => void uitloggen()}>
              Uitloggen
            </Knop>
          )}
        </div>
      </form>
    </Kaart>
  );

  if (verplicht) {
    return (
      <div className="loginpagina">
        <main className="container container--smal" style={{ width: '100%', maxWidth: 520 }}>
          <PaginaKop eyebrow="Eerste keer inloggen" titel="Kies je eigen wachtwoord">
            Je bent ingelogd met een tijdelijk wachtwoord. Stel eerst een eigen wachtwoord in voordat je verdergaat.
          </PaginaKop>
          {formulier}
        </main>
      </div>
    );
  }

  return (
    <div className="container--smal" style={{ margin: '0 auto' }}>
      <PaginaKop eyebrow="Account" titel="Wachtwoord wijzigen" />
      {formulier}
    </div>
  );
}
