import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Invoer, Knop, Melding } from '../components/ui';
import { foutTekst } from '../lib/format';
import { configuratieCompleet, supabase } from '../lib/supabase';

const logo = `${import.meta.env.BASE_URL}agium-logo.png`;

export function InloggenPagina() {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!email.trim() || !wachtwoord) {
      setFout('Vul je e-mailadres en wachtwoord in.');
      return;
    }
    setBezig(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: wachtwoord });
    setBezig(false);
    if (error) setFout(foutTekst(error));
  }

  return (
    <div className="loginpagina">
      <main className="loginkaart">
        <img src={logo} alt="Agium" className="loginkaart__logo" />
        <div className="stapel">
          <div className="stapel" style={{ gap: 'var(--space-1)' }}>
            <span className="eyebrow">Ticketing</span>
            <h1>Inloggen</h1>
            <p className="muted klein">Stel je vraag aan Finance of IT. Log in met je e-mailadres van Agium.</p>
          </div>
          {!configuratieCompleet && (
            <Melding variant="aandacht" titel="App niet ingesteld">
              De verbinding met de database ontbreekt. Neem contact op met IT.
            </Melding>
          )}
          {fout && <Melding variant="aandacht">{fout}</Melding>}
          <form className="stapel" onSubmit={verstuur} noValidate>
            <Invoer
              label="E-mailadres"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Invoer
              label="Wachtwoord"
              type="password"
              autoComplete="current-password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
              required
            />
            <Knop type="submit" icoon={LogIn} disabled={bezig}>
              {bezig ? 'Bezig met inloggen...' : 'Inloggen'}
            </Knop>
          </form>
          <p className="muted klein">Wachtwoord vergeten of nog geen account? Vraag het aan IT.</p>
        </div>
      </main>
    </div>
  );
}
