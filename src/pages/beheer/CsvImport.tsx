import { Download, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Badge, Kaart, Knop, Melding } from '../../components/ui';
import { leesImportCsv, naarCsv, type ImportRegel } from '../../lib/csv';
import { foutTekst } from '../../lib/format';
import { roepFunctieAan, type BulkResultaat } from '../../lib/functies';

const MAX = 200;
const PORTIE = 50;
const MAX_BESTAND = 200 * 1024;

export function CsvImport({ naImport }: { naImport: () => void }) {
  const [regels, setRegels] = useState<ImportRegel[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  // Resultaat met wachtwoorden staat alleen in het geheugen van deze pagina.
  const [resultaat, setResultaat] = useState<BulkResultaat | null>(null);
  const [gedownload, setGedownload] = useState(false);

  async function kiesBestand(e: ChangeEvent<HTMLInputElement>) {
    setFout(null);
    setRegels(null);
    const bestand = e.target.files?.[0];
    e.target.value = '';
    if (!bestand) return;
    if (bestand.size > MAX_BESTAND) {
      setFout('Het bestand is te groot.');
      return;
    }
    try {
      const r = leesImportCsv(await bestand.text());
      if (r.length > MAX) throw new Error(`Maximaal ${MAX} gebruikers per keer. Splits het bestand.`);
      setRegels(r);
    } catch (err) {
      setFout(foutTekst(err));
    }
  }

  async function importeer() {
    if (!regels) return;
    setBezig(true);
    setFout(null);
    // Porties van maximaal PORTIE regels per aanroep; resultaten worden samengevoegd.
    const totaal: BulkResultaat = { resultaten: [], gelukt: 0, mislukt: 0 };
    try {
      for (let start = 0; start < regels.length; start += PORTIE) {
        const portie = regels.slice(start, start + PORTIE);
        const res = await roepFunctieAan<BulkResultaat>('admin-bulk-create-users', {
          users: portie.map((r) => ({ email: r.email, full_name: r.full_name, team_prefix: r.team_prefix || undefined, role: r.role || undefined })),
        });
        // Regelnummers terugvertalen naar het bestand
        totaal.resultaten.push(...res.resultaten.map((x) => ({ ...x, regel: portie[x.regel - 1]?.regel ?? x.regel })));
        totaal.gelukt += res.gelukt;
        totaal.mislukt += res.mislukt;
      }
      setResultaat(totaal);
      setRegels(null);
      naImport();
    } catch (err) {
      // Toon wat al wel is aangemaakt (met wachtwoorden), zodat dat niet verloren gaat.
      if (totaal.resultaten.length > 0) {
        setResultaat(totaal);
        setRegels(null);
        naImport();
      }
      setFout(`${foutTekst(err)} Regels na de laatste getoonde regel zijn niet verwerkt.`);
    } finally {
      setBezig(false);
    }
  }

  function download() {
    if (!resultaat) return;
    const rijen = [
      ['regel', 'email', 'resultaat', 'reden', 'tijdelijk_wachtwoord'],
      ...resultaat.resultaten.map((r) => [String(r.regel), r.email, r.ok ? 'gelukt' : 'mislukt', r.reden ?? '', r.temp_password ?? '']),
    ];
    const blob = new Blob([naarCsv(rijen)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tijdelijke-wachtwoorden.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setGedownload(true);
  }

  function sluit() {
    setResultaat(null);
    setFout(null);
    setGedownload(false);
  }

  if (resultaat) {
    const metWachtwoord = resultaat.resultaten.some((r) => r.temp_password);
    return (
      <Kaart aria-labelledby="import-resultaat">
        <div className="stapel">
          <h2 id="import-resultaat">Resultaat van de import</h2>
          {fout && <Melding variant="aandacht">{fout}</Melding>}
          <div className="rij">
            <Badge variant="positief">{resultaat.gelukt} gelukt</Badge>
            <Badge variant={resultaat.mislukt ? 'aandacht' : 'neutraal'}>{resultaat.mislukt} mislukt</Badge>
          </div>
          {metWachtwoord && (
            <Melding variant="aandacht" titel="Download het overzicht nu: het kan maar één keer">
              Het overzicht bevat de tijdelijke wachtwoorden. Ze worden nergens bewaard. Geef ze persoonlijk of via een privéchat door en
              verwijder het bestand daarna.
            </Melding>
          )}
          <div className="tabel-wrap">
            <table className="tabel">
              <caption className="sr-only">Resultaat per regel</caption>
              <thead>
                <tr>
                  <th>Regel</th>
                  <th>E-mail</th>
                  <th>Resultaat</th>
                  <th>Reden</th>
                </tr>
              </thead>
              <tbody>
                {resultaat.resultaten.map((r) => (
                  <tr key={r.regel}>
                    <td>{r.regel}</td>
                    <td>{r.email}</td>
                    <td>{r.ok ? <Badge variant="positief">Gelukt</Badge> : <Badge variant="aandacht">Mislukt</Badge>}</td>
                    <td className="muted">{r.reden ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rij">
            {metWachtwoord && (
              <Knop icoon={Download} onClick={download} disabled={gedownload}>
                {gedownload ? 'Gedownload' : 'Download overzicht met wachtwoorden'}
              </Knop>
            )}
            <Knop variant="rand" onClick={sluit} disabled={metWachtwoord && !gedownload}>
              Sluiten
            </Knop>
          </div>
        </div>
      </Kaart>
    );
  }

  return (
    <Kaart aria-labelledby="csv-import">
      <div className="stapel">
        <h2 id="csv-import">Importeren uit CSV</h2>
        <p className="muted klein">
          Kolommen: <code>naam</code>, <code>email</code> en optioneel <code>team</code> (prefix, bijvoorbeeld FIN) en <code>rol</code>{' '}
          (handler of admin). Komma of puntkomma als scheidingsteken. Maximaal {MAX} regels.
        </p>
        {fout && <Melding variant="aandacht">{fout}</Melding>}
        <div>
          <label className="knop knop--rand">
            <Upload size={18} aria-hidden="true" />
            CSV-bestand kiezen
            <input type="file" accept=".csv,text/csv" onChange={(e) => void kiesBestand(e)} className="sr-only" />
          </label>
        </div>
        {regels && (
          <>
            <p className="klein">{regels.length} gebruikers gevonden. Controleer de lijst en klik op Importeren.</p>
            <div className="tabel-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tabel">
                <caption className="sr-only">Voorbeeld van de import</caption>
                <thead>
                  <tr>
                    <th>Regel</th>
                    <th>Naam</th>
                    <th>E-mail</th>
                    <th>Team</th>
                    <th>Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {regels.map((r) => (
                    <tr key={r.regel}>
                      <td>{r.regel}</td>
                      <td>{r.full_name}</td>
                      <td>{r.email}</td>
                      <td>{r.team_prefix}</td>
                      <td>{r.team_prefix ? r.role || 'handler' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rij">
              <Knop icoon={Upload} onClick={() => void importeer()} disabled={bezig}>
                {bezig ? 'Bezig met importeren...' : `${regels.length} gebruikers importeren`}
              </Knop>
              <Knop variant="spook" onClick={() => setRegels(null)} disabled={bezig}>
                Annuleren
              </Knop>
            </div>
          </>
        )}
      </div>
    </Kaart>
  );
}
