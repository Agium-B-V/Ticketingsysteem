import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Kaart, Knop, Melding } from './ui';

/** Toont een tijdelijk wachtwoord één keer. Na sluiten is het weg (alleen in geheugen). */
export function TijdelijkWachtwoord({
  naam,
  email,
  wachtwoord,
  onSluit,
}: {
  naam?: string;
  email: string;
  wachtwoord: string;
  onSluit: () => void;
}) {
  const [gekopieerd, setGekopieerd] = useState(false);

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(wachtwoord);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2500);
    } catch {
      setGekopieerd(false);
    }
  }

  return (
    <Kaart variant="zacht" aria-label="Tijdelijk wachtwoord">
      <div className="stapel">
        <span className="eyebrow">Tijdelijk wachtwoord</span>
        <h2>{naam ? `${naam} (${email})` : email}</h2>
        <div className="wachtwoordvak">
          <code aria-label="Tijdelijk wachtwoord">{wachtwoord}</code>
          <Knop variant="rand" klein icoon={gekopieerd ? Check : Copy} onClick={() => void kopieer()}>
            {gekopieerd ? 'Gekopieerd' : 'Kopiëren'}
          </Knop>
        </div>
        <Melding variant="aandacht" titel="Je ziet dit wachtwoord maar één keer">
          Geef het persoonlijk of via een privéchat door, nooit in een groepskanaal en nooit in het ticketsysteem. De gebruiker moet het
          bij de eerste keer inloggen wijzigen.
        </Melding>
        <div>
          <Knop variant="secundair" onClick={onSluit}>
            Ik heb het doorgegeven, sluiten
          </Knop>
        </div>
      </div>
    </Kaart>
  );
}
