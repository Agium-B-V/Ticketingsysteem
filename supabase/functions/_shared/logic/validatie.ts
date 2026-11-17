// Pure validatielogica voor de Edge Functions. Geen Deno- of Node-specifieke
// code, zodat dit zowel in Deno (functies) als in Node (unit-tests) draait.

export type TeamRol = 'handler' | 'admin';

export const MAX_BULK = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; reden: string };

/** Komma-gescheiden lijst uit een omgevingsvariabele, opgeschoond. */
export function parseLijst(waarde: string | undefined | null): string[] {
  return (waarde ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Toegestane domeinen, in kleine letters, zonder @. */
export function parseDomeinen(waarde: string | undefined | null): string[] {
  return parseLijst(waarde).map((d) => d.toLowerCase().replace(/^@/, ''));
}

/** Toegestane origins. `*` wordt nooit geaccepteerd. */
export function parseOrigins(waarde: string | undefined | null): string[] {
  return parseLijst(waarde)
    .map((o) => o.replace(/\/+$/, ''))
    .filter((o) => o !== '*' && /^https?:\/\/[^/\s]+$/.test(o));
}

export function valideerEmail(invoer: unknown, domeinen: string[]): Resultaat<string> {
  if (typeof invoer !== 'string') return { ok: false, reden: 'E-mailadres ontbreekt' };
  const email = invoer.trim().toLowerCase();
  if (email.length === 0) return { ok: false, reden: 'E-mailadres ontbreekt' };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reden: 'Ongeldig e-mailadres' };
  if (domeinen.length === 0) return { ok: false, reden: 'Er zijn geen toegestane e-maildomeinen ingesteld' };
  const domein = email.slice(email.lastIndexOf('@') + 1);
  if (!domeinen.includes(domein)) return { ok: false, reden: 'Dit e-maildomein is niet toegestaan' };
  return { ok: true, waarde: email };
}

export function valideerNaam(invoer: unknown): Resultaat<string> {
  if (typeof invoer !== 'string') return { ok: false, reden: 'Naam ontbreekt' };
  const naam = invoer.trim().replace(/\s+/g, ' ');
  if (naam.length === 0) return { ok: false, reden: 'Naam ontbreekt' };
  if (naam.length > 120) return { ok: false, reden: 'Naam is te lang (maximaal 120 tekens)' };
  if (CONTROL_RE.test(naam)) return { ok: false, reden: 'Naam bevat ongeldige tekens' };
  return { ok: true, waarde: naam };
}

export function valideerRol(invoer: unknown): Resultaat<TeamRol> {
  if (invoer === 'handler' || invoer === 'admin') return { ok: true, waarde: invoer };
  return { ok: false, reden: 'Rol moet handler of admin zijn' };
}

export function valideerUuid(invoer: unknown): Resultaat<string> {
  if (typeof invoer === 'string' && UUID_RE.test(invoer)) return { ok: true, waarde: invoer.toLowerCase() };
  return { ok: false, reden: 'Ongeldige id' };
}

export interface Lidmaatschap {
  team_id: string;
  role: TeamRol;
}

export function valideerLidmaatschappen(invoer: unknown): Resultaat<Lidmaatschap[]> {
  if (invoer === undefined || invoer === null) return { ok: true, waarde: [] };
  if (!Array.isArray(invoer)) return { ok: false, reden: 'Teamlidmaatschappen moeten een lijst zijn' };
  if (invoer.length > 20) return { ok: false, reden: 'Te veel teamlidmaatschappen' };
  const uit: Lidmaatschap[] = [];
  const gezien = new Set<string>();
  for (const item of invoer) {
    if (typeof item !== 'object' || item === null) return { ok: false, reden: 'Ongeldig teamlidmaatschap' };
    const team = valideerUuid((item as Record<string, unknown>).team_id);
    if (!team.ok) return { ok: false, reden: 'Ongeldig team' };
    const rol = valideerRol((item as Record<string, unknown>).role);
    if (!rol.ok) return rol;
    if (gezien.has(team.waarde)) return { ok: false, reden: 'Een team staat dubbel in de lijst' };
    gezien.add(team.waarde);
    uit.push({ team_id: team.waarde, role: rol.waarde });
  }
  return { ok: true, waarde: uit };
}

export interface BulkRegel {
  email: string;
  full_name: string;
  team_prefix?: string;
  role?: TeamRol;
}

/** Valideert de vorm van één bulkregel (zonder domeincontrole op teams). */
export function valideerBulkRegel(
  invoer: unknown,
  domeinen: string[],
): Resultaat<{ email: string; full_name: string; team_prefix: string | null; role: TeamRol | null }> {
  if (typeof invoer !== 'object' || invoer === null) return { ok: false, reden: 'Ongeldige regel' };
  const r = invoer as Record<string, unknown>;
  const email = valideerEmail(r.email, domeinen);
  if (!email.ok) return email;
  const naam = valideerNaam(r.full_name);
  if (!naam.ok) return naam;
  const prefixRuw = typeof r.team_prefix === 'string' ? r.team_prefix.trim().toUpperCase() : '';
  const rolRuw = typeof r.role === 'string' ? r.role.trim().toLowerCase() : '';
  if (!prefixRuw && rolRuw) return { ok: false, reden: 'Rol opgegeven zonder team' };
  if (prefixRuw && !/^[A-Z]{2,6}$/.test(prefixRuw)) return { ok: false, reden: 'Ongeldige teamprefix' };
  let rol: TeamRol | null = null;
  if (prefixRuw) {
    const v = valideerRol(rolRuw || 'handler');
    if (!v.ok) return v;
    rol = v.waarde;
  }
  return { ok: true, waarde: { email: email.waarde, full_name: naam.waarde, team_prefix: prefixRuw || null, role: rol } };
}
