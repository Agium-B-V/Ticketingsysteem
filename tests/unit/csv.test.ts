import { describe, expect, it } from 'vitest';
import { csvVeld, leesImportCsv, naarCsv, parseCsv } from '../../src/lib/csv';

describe('CSV', () => {
  it('leest komma- en puntkommabestanden met aanhalingstekens', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'z "q"'],
    ]);
    expect(parseCsv('﻿a;b\r\n1;2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('leest importregels met Nederlandse kolomnamen', () => {
    const regels = leesImportCsv('Naam;E-mail;Team;Rol\nTest Een;test.een@example.com;fin;Handler\nTest Twee;test.twee@example.com;;\n');
    expect(regels).toEqual([
      { regel: 2, full_name: 'Test Een', email: 'test.een@example.com', team_prefix: 'FIN', role: 'handler' },
      { regel: 3, full_name: 'Test Twee', email: 'test.twee@example.com', team_prefix: '', role: '' },
    ]);
  });

  it('geeft een duidelijke fout bij een verkeerde kop', () => {
    expect(() => leesImportCsv('voornaam,adres\nx,y')).toThrow(/naam en email/);
    expect(() => leesImportCsv('naam,email\n')).toThrow(/geen gebruikers/);
  });

  it('beschermt tegen formules in Excel', () => {
    expect(csvVeld('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvVeld('+31')).toBe("'+31");
    expect(naarCsv([['a', 'b;c']])).toBe('﻿a;"b;c"\r\n');
  });
});
