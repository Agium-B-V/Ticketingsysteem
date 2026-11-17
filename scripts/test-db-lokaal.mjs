// Draait de RLS-testset tegen een tijdelijke, lokale Postgres zonder Docker.
//
// Vereist initdb, pg_ctl en psql op het PATH (bv. de portable PostgreSQL-binaries).
// Het script maakt een nieuw cluster in .tmp/, zet het nagebootste Supabase-auth-
// schema neer, draait alle migraties, voert `vitest --project db` uit en ruimt
// daarna alles op. Er wordt nooit verbonden met een externe database.
//
// Let op: dit benadert de echte Supabase-omgeving alleen. De CI draait dezelfde
// tests ook tegen een echte lokale Supabase (supabase start).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const root = resolve(import.meta.dirname, '..');
const tmpRoot = join(root, '.tmp');
mkdirSync(tmpRoot, { recursive: true });
const dataDir = mkdtempSync(join(tmpRoot, 'pg-'));

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} faalde met code ${res.status}`);
  }
}

function freePort() {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
    srv.on('error', fail);
  });
}

const port = await freePort();
let started = false;
let exitCode;

try {
  run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale']);
  run('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start', '-l', join(dataDir, 'log.txt')]);
  started = true;

  const psql = (file) =>
    run('psql', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', file]);

  psql(join(root, 'tests', 'db', 'mock-supabase.sql'));
  const migDir = join(root, 'supabase', 'migrations');
  for (const f of readdirSync(migDir).filter((n) => n.endsWith('.sql')).sort()) {
    console.warn(`Migratie: ${f}`);
    psql(join(migDir, f));
  }

  const vitest = spawnSync(process.execPath, [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--project', 'db'], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/postgres`, DB_TEST_OMGEVING: 'mock' },
  });
  exitCode = vitest.status ?? 1;
} catch (err) {
  console.error(err.message);
  exitCode = 1;
} finally {
  if (started) {
    spawnSync('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' });
  }
  rmSync(dataDir, { recursive: true, force: true });
}

process.exit(exitCode);
