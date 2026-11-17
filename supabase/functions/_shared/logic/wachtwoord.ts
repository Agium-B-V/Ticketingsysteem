// Genereert server-side een sterk tijdelijk wachtwoord met de Web Crypto API
// (beschikbaar in Deno en Node). Geen dubbelzinnige tekens (0/O, 1/l/I) zodat
// het wachtwoord foutloos is over te typen.

const HOOFD = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const KLEIN = 'abcdefghijkmnpqrstuvwxyz';
const CIJFER = '23456789';
const TEKEN = '!@#$%*-_+=?';
const ALLES = HOOFD + KLEIN + CIJFER + TEKEN;

export const MIN_LENGTE = 12;
export const STANDAARD_LENGTE = 16;

/** Uniform willekeurig getal in [0, max) zonder modulo-bias. */
function willekeurig(max: number): number {
  const grens = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < grens) return v % max;
  }
}

function kies(set: string): string {
  return set[willekeurig(set.length)]!;
}

export function genereerWachtwoord(lengte: number = STANDAARD_LENGTE): string {
  if (!Number.isInteger(lengte) || lengte < MIN_LENGTE || lengte > 128) {
    throw new Error(`Lengte moet tussen ${MIN_LENGTE} en 128 liggen`);
  }
  const tekens = [kies(HOOFD), kies(KLEIN), kies(CIJFER), kies(TEKEN)];
  while (tekens.length < lengte) tekens.push(kies(ALLES));
  // Fisher-Yates met cryptografische willekeur
  for (let i = tekens.length - 1; i > 0; i--) {
    const j = willekeurig(i + 1);
    [tekens[i], tekens[j]] = [tekens[j]!, tekens[i]!];
  }
  return tekens.join('');
}
