// CORS-beslissing voor de beheerfuncties, los van Deno zodat het in Node te testen is.
// Alleen origins uit de allowlist krijgen Access-Control-Allow-Origin, en dan
// altijd die ene origin. Nooit `*`.

export const BASIS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin',
};

export interface CorsBeslissing {
  toegestaan: boolean;
  headers: Record<string, string>;
}

/**
 * @param origin  waarde van de Origin-header (null bij server-naar-server-verzoeken)
 * @param allowlist  toegestane origins (zie parseOrigins)
 */
export function corsVoor(origin: string | null, allowlist: string[]): CorsBeslissing {
  if (!origin) return { toegestaan: true, headers: { ...BASIS_HEADERS } };
  if (origin === '*' || origin === 'null' || !allowlist.includes(origin)) {
    return { toegestaan: false, headers: { ...BASIS_HEADERS } };
  }
  return {
    toegestaan: true,
    headers: {
      ...BASIS_HEADERS,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
    },
  };
}
