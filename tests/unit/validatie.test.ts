import { describe, expect, it } from 'vitest';
import {
  parseDomeinen,
  parseOrigins,
  valideerBulkRegel,
  valideerEmail,
  valideerLidmaatschappen,
  valideerNaam,
  valideerRol,
  valideerUuid,
} from '../../supabase/functions/_shared/logic/validatie.ts';
import { genereerWachtwoord, MIN_LENGTE } from '../../supabase/functions/_shared/logic/wachtwoord.ts';

const DOMEINEN = ['example.com'];

describe('e-mailvalidatie en bedrijfsdomein', () => {
  it('accepteert een adres op het toegestane domein en normaliseert', () => {
    expect(valideerEmail('  Test.Medewerker@Example.COM ', DOMEINEN)).toEqual({ ok: true, waarde: 'test.medewerker@example.com' });
  });

  it('weigert andere domeinen, ook subdomeinen en lookalikes', () => {
    for (const e of ['a@gmail.com', 'a@sub.example.com', 'a@example.com.evil.nl', 'a@examplecom']) {
      expect(valideerEmail(e, DOMEINEN).ok, e).toBe(false);
    }
  });

  it('weigert alles als er geen domein is ingesteld', () => {
    expect(valideerEmail('a@example.com', [])).toEqual({ ok: false, reden: 'Er zijn geen toegestane e-maildomeinen ingesteld' });
  });

  it('weigert ongeldige invoer', () => {
    for (const e of [undefined, null, 42, '', 'geen-at', 'a@b', 'a b@example.com']) {
      expect(valideerEmail(e, DOMEINEN).ok).toBe(false);
    }
  });

  it('parseDomeinen en parseOrigins', () => {
    expect(parseDomeinen(' Example.com, @agium.test ,, ')).toEqual(['example.com', 'agium.test']);
    expect(parseOrigins('https://a.github.io/, *, http://localhost:5173, javascript:alert(1)')).toEqual([
      'https://a.github.io',
      'http://localhost:5173',
    ]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
});

describe('naam, rol, uuid en lidmaatschappen', () => {
  it('naam', () => {
    expect(valideerNaam('  Test   Medewerker ')).toEqual({ ok: true, waarde: 'Test Medewerker' });
    expect(valideerNaam('').ok).toBe(false);
    expect(valideerNaam('x'.repeat(121)).ok).toBe(false);
    expect(valideerNaam('a\u0000b').ok).toBe(false);
  });

  it('rol', () => {
    expect(valideerRol('handler').ok).toBe(true);
    expect(valideerRol('admin').ok).toBe(true);
    expect(valideerRol('superadmin').ok).toBe(false);
  });

  it('uuid', () => {
    expect(valideerUuid('3f1c2a8e-1b2c-4d5e-8f90-123456789abc').ok).toBe(true);
    expect(valideerUuid("1; drop table x").ok).toBe(false);
  });

  it('lidmaatschappen', () => {
    const id = '3f1c2a8e-1b2c-4d5e-8f90-123456789abc';
    expect(valideerLidmaatschappen(undefined)).toEqual({ ok: true, waarde: [] });
    expect(valideerLidmaatschappen([{ team_id: id, role: 'admin' }]).ok).toBe(true);
    expect(valideerLidmaatschappen([{ team_id: id, role: 'admin' }, { team_id: id, role: 'handler' }]).ok).toBe(false);
    expect(valideerLidmaatschappen([{ team_id: 'x', role: 'admin' }]).ok).toBe(false);
    expect(valideerLidmaatschappen('FIN').ok).toBe(false);
  });

  it('bulkregel', () => {
    expect(valideerBulkRegel({ email: 'a@example.com', full_name: 'A', team_prefix: 'fin' }, DOMEINEN)).toEqual({
      ok: true,
      waarde: { email: 'a@example.com', full_name: 'A', team_prefix: 'FIN', role: 'handler' },
    });
    expect(valideerBulkRegel({ email: 'a@example.com', full_name: 'A' }, DOMEINEN)).toEqual({
      ok: true,
      waarde: { email: 'a@example.com', full_name: 'A', team_prefix: null, role: null },
    });
    expect(valideerBulkRegel({ email: 'a@example.com', full_name: 'A', role: 'admin' }, DOMEINEN).ok).toBe(false);
    expect(valideerBulkRegel({ email: 'a@example.com', full_name: 'A', team_prefix: 'FIN', role: 'baas' }, DOMEINEN).ok).toBe(false);
  });
});

describe('tijdelijk wachtwoord', () => {
  it('is minimaal 12 tekens met hoofdletter, kleine letter, cijfer en teken', () => {
    for (let i = 0; i < 200; i++) {
      const w = genereerWachtwoord();
      expect(w.length).toBeGreaterThanOrEqual(MIN_LENGTE);
      expect(w).toMatch(/[A-Z]/);
      expect(w).toMatch(/[a-z]/);
      expect(w).toMatch(/[2-9]/);
      expect(w).toMatch(/[!@#$%*\-_+=?]/);
      expect(w).not.toMatch(/[0O1lI]/);
      expect(w).toMatch(/^[A-Za-z]/);
    }
  });

  it('is uniek en weigert te korte lengtes', () => {
    const set = new Set(Array.from({ length: 500 }, () => genereerWachtwoord()));
    expect(set.size).toBe(500);
    expect(() => genereerWachtwoord(8)).toThrow();
  });
});
