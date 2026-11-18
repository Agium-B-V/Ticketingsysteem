import { describe, expect, it } from 'vitest';
import { corsVoor } from '../../supabase/functions/_shared/logic/cors.ts';
import { parseOrigins } from '../../supabase/functions/_shared/logic/validatie.ts';

const LIJST = parseOrigins('https://agium-b-v.github.io, https://ticketing.azurestaticapps.net');

describe('CORS van de beheerfuncties', () => {
  it('geeft een toegestane origin precies terug, nooit *', () => {
    const r = corsVoor('https://agium-b-v.github.io', LIJST);
    expect(r.toegestaan).toBe(true);
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://agium-b-v.github.io');
    expect(r.headers.Vary).toBe('Origin');
  });

  it('weigert vreemde origins, lookalikes, * en null zonder CORS-headers', () => {
    for (const o of ['https://evil.example.org', 'https://agium-b-v.github.io.evil.nl', 'http://agium-b-v.github.io', '*', 'null']) {
      const r = corsVoor(o, LIJST);
      expect(r.toegestaan, o).toBe(false);
      expect(r.headers['Access-Control-Allow-Origin'], o).toBeUndefined();
    }
  });

  it('weigert alles als er geen origins zijn ingesteld, ook als * is ingevuld', () => {
    expect(corsVoor('https://agium-b-v.github.io', parseOrigins('')).toegestaan).toBe(false);
    expect(corsVoor('https://agium-b-v.github.io', parseOrigins('*')).toegestaan).toBe(false);
  });

  it('verzoeken zonder Origin (geen browser) krijgen geen CORS-headers', () => {
    const r = corsVoor(null, LIJST);
    expect(r.toegestaan).toBe(true);
    expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
