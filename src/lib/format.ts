import type { Prioriteit, Status, TeamRol } from './types';

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_behandeling: 'In behandeling',
  afgerond: 'Afgerond',
  geannuleerd: 'Geannuleerd',
};

export const STATUSSEN: Status[] = ['open', 'in_behandeling', 'afgerond', 'geannuleerd'];

export const PRIORITEIT_LABEL: Record<Prioriteit, string> = {
  laag: 'Laag',
  midden: 'Midden',
  hoog: 'Hoog',
};

export const PRIORITEITEN: Prioriteit[] = ['laag', 'midden', 'hoog'];

export const PRIORITEIT_GEWICHT: Record<Prioriteit, number> = { laag: 1, midden: 2, hoog: 3 };

export const ROL_LABEL: Record<TeamRol, string> = {
  handler: 'Behandelaar',
  admin: 'Admin',
};

const datumFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
const datumTijdFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const datum = (iso: string) => datumFmt.format(new Date(iso));
export const datumTijd = (iso: string) => datumTijdFmt.format(new Date(iso));

/** Zet een technische foutmelding om in een begrijpelijke Nederlandse tekst. */
export function foutTekst(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/Invalid login credentials/i.test(msg)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/banned/i.test(msg)) return 'Je account is niet actief. Neem contact op met IT.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Geen verbinding. Controleer je internet en probeer het opnieuw.';
  if (/row-level security|permission denied/i.test(msg)) return 'Je hebt hiervoor geen rechten.';
  if (/should be different from the old password/i.test(msg)) return 'Kies een ander wachtwoord dan je huidige.';
  if (/Password should be at least|weak/i.test(msg)) return 'Dit wachtwoord is te zwak of te kort (minimaal 12 tekens).';
  if (/pwned|leaked|compromised/i.test(msg)) return 'Dit wachtwoord komt voor in gelekte wachtwoordlijsten. Kies een ander.';
  if (/rate limit|too many/i.test(msg)) return 'Te veel pogingen. Wacht even en probeer het opnieuw.';
  return msg || 'Er ging iets mis. Probeer het opnieuw.';
}
