// Eenvoudige CSV-verwerking voor de bulkimport. Ondersteunt komma en puntkomma
// (Nederlandse Excel), aanhalingstekens en regeleinden in velden.

const BOM = String.fromCharCode(0xfeff);

export function detecteerScheidingsteken(tekst: string): ',' | ';' {
  const eersteRegel = tekst.split(/\r?\n/, 1)[0] ?? '';
  const puntkomma = (eersteRegel.match(/;/g) ?? []).length;
  const komma = (eersteRegel.match(/,/g) ?? []).length;
  return puntkomma > komma ? ';' : ',';
}

export function parseCsv(invoer: string): string[][] {
  const tekst = invoer.replace(new RegExp('^' + BOM), '');
  const sep = detecteerScheidingsteken(tekst);
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = '';
  let inQuotes = false;

  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (tekst[i + 1] === '"') {
          veld += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        veld += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      rij.push(veld);
      veld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && tekst[i + 1] === '\n') i++;
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = '';
    } else {
      veld += c;
    }
  }
  if (veld.length > 0 || rij.length > 0) {
    rij.push(veld);
    rijen.push(rij);
  }
  return rijen.filter((r) => r.some((v) => v.trim().length > 0));
}

export interface ImportRegel {
  regel: number;
  full_name: string;
  email: string;
  team_prefix: string;
  role: string;
}

const KOP_NAAM = ['naam', 'volledige naam', 'full_name', 'name'];
const KOP_EMAIL = ['email', 'e-mail', 'e-mailadres', 'emailadres'];
const KOP_TEAM = ['team', 'team_prefix', 'prefix'];
const KOP_ROL = ['rol', 'role'];

/** Zet CSV-tekst om naar importregels. Gooit een fout met uitleg als de kop niet klopt. */
export function leesImportCsv(tekst: string): ImportRegel[] {
  const rijen = parseCsv(tekst);
  if (rijen.length < 2) throw new Error('Het bestand bevat geen gebruikers.');
  const kop = rijen[0]!.map((k) => k.trim().toLowerCase());
  const idx = (namen: string[]) => kop.findIndex((k) => namen.includes(k));
  const iNaam = idx(KOP_NAAM);
  const iEmail = idx(KOP_EMAIL);
  if (iNaam < 0 || iEmail < 0) {
    throw new Error('De eerste regel moet de kolommen naam en email bevatten (optioneel team en rol).');
  }
  const iTeam = idx(KOP_TEAM);
  const iRol = idx(KOP_ROL);
  return rijen.slice(1).map((r, i) => ({
    regel: i + 2,
    full_name: (r[iNaam] ?? '').trim(),
    email: (r[iEmail] ?? '').trim(),
    team_prefix: iTeam >= 0 ? (r[iTeam] ?? '').trim().toUpperCase() : '',
    role: iRol >= 0 ? (r[iRol] ?? '').trim().toLowerCase() : '',
  }));
}

/** Maakt één CSV-veld veilig: aanhalingstekens en bescherming tegen formules in Excel. */
export function csvVeld(waarde: string): string {
  let v = waarde;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[";,\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function naarCsv(rijen: string[][], sep: ',' | ';' = ';'): string {
  return BOM + rijen.map((r) => r.map(csvVeld).join(sep)).join('\r\n') + '\r\n';
}
