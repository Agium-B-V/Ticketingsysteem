# Bouwplan Agium Ticketing

Dit plan beschrijft hoe het ticketsysteem is opgebouwd. Het is geschreven vóór de bouw en bijgewerkt waar de uitvoering afweek.

## Repo-structuur

```
.github/workflows/      ci.yml (lint, typecheck, build, tests incl. RLS tegen lokale Supabase) en deploy.yml (GitHub Pages)
docs/                   BOUWPLAN, OPENSTAANDE-KEUZES, CHECKLIST-OPDRACHTGEVER, voorbeeld-import.csv
public/                 statische bestanden (logo)
scripts/                hulpscripts (tijdelijke Postgres voor lokale RLS-tests)
src/
  components/           UI-bouwstenen in Agium-huisstijl (knoppen, velden, badges, layout)
  lib/                  Supabase-client, auth-context, types, formattering, CSV
  pages/                schermen (inloggen, mijn tickets, indienen, lijst, detail, dashboard, beheer)
  styles/               tokens.css (design tokens) en app.css
supabase/
  config.toml           lokale Supabase-configuratie (zelfregistratie uit, wachtwoord min. 12)
  migrations/           schema, RLS, hulpfuncties, seed van teams
  functions/            Edge Functions voor accountbeheer + _shared
  bootstrap-admin.sql   sjabloon voor het allereerste IT-admin-account
tests/
  db/                   RLS-testset op databaseniveau (draait tegen elke Postgres met Supabase-auth-schema)
  api/                  testset via REST, Realtime en Edge Functions (alleen tegen lokale Supabase in CI)
  unit/                 unit-tests (CSV, validatie, wachtwoordgenerator)
```

## Aanpak per fase

1. **Scaffolding**: Vite + React + TypeScript, ESLint, Vitest, `.env.example`, `.gitignore`, basis-README.
2. **Database**: één migratie met enums, tabellen, triggers (ticketnummer, `updated_at`, `closed_at`, bewaking van wijzigingen), hulpfuncties (`security definer`, `search_path = ''`), RLS-policies, kolomrechten en een seed-migratie voor de teams Finance, IT en HR. Daarnaast een testset die per scenario als `anon` of als een specifieke gebruiker (via `request.jwt.claims`) queries uitvoert.
3. **Edge Functions**: `admin-create-user`, `admin-bulk-create-users`, `admin-reset-password`, `admin-set-active`. Gedeelde code voor CORS, aanroeper-verificatie (`is_it_admin()` via de database), validatie en wachtwoordgeneratie. Pure logica is ook in Node te testen.
4. **Frontend**: HashRouter, auth-context met profiel en lidmaatschappen, schermen uit sectie 6 van de specificatie, Realtime-verversing van lijsten.
5. **CI/CD en documentatie**: CI draait `supabase start` in de runner en daarop de RLS- en API-tests. Deploy bouwt met `VITE_BASE_PATH=/<repo>/` en publiceert via `actions/deploy-pages`. README, checklist, bootstrap-SQL en voorbeeld-CSV.
6. **Zelfcontrole**: lint, typecheck, build, unit- en DB-tests lokaal. Daarna een onafhankelijke reviewer-subagent op migraties, RLS en Edge Functions.

## Beveiligingsprincipes

- Alle autorisatie zit in de database (RLS) en in de Edge Functions. De frontend verbergt alleen.
- `anon` krijgt nergens rechten: geen tabellen, geen functies en geen gebruik van het `public`-schema.
- Rol en team komen uitsluitend uit `team_members`, nooit uit `user_metadata` of JWT-claims.
- Iedere policy weegt `has_access()` mee: het account is actief en het tijdelijke wachtwoord is gewijzigd.
- Schrijfrechten lopen via kolomrechten (`grant update (status, priority)`) plus een trigger die per rol bewaakt wat mag veranderen.
- `security definer`-functies hebben een vaste `search_path` en geven alleen informatie over de ingelogde gebruiker zelf of controleren expliciet de rechten.
- De service-role key bestaat alleen als Supabase-secret in de Edge Functions.

## Risico's

| Risico | Maatregel |
| --- | --- |
| Fout in RLS staat na merge direct live (Supabase-GitHub-koppeling) | RLS-testset draait in CI tegen een lokale Supabase; jij merget zelf. |
| Bestaan van vertrouwelijke tickets lekt via gaten in de nummering of via `ticket_counter` | Vertrouwelijke tickets krijgen een willekeurig nummer (`FIN-V-3F9A1C27`); de teller is niet leesbaar voor gebruikers. |
| Gebruiker wijzigt zijn login-e-mailadres buiten het bedrijfsdomein | `has_access()` vergelijkt `auth.users.email` met het profiel; bij verschil geen toegang. |
| Gedeactiveerde gebruiker houdt een geldig token | `has_access()` in elke policy en in de Edge Functions. |
| Uitsluiting doordat de laatste IT-admin wordt verwijderd | Trigger weigert het verwijderen of degraderen van de laatste IT-admin. Zelf-deactivatie is geblokkeerd. |
| Tijdelijk wachtwoord geeft al toegang tot gegevens | Zolang `must_change_password` aan staat, geeft RLS niets terug behalve het eigen profiel. |
| Lokaal geen Docker | Lokale tests op een tijdelijke Postgres met nagebootst `auth`-schema; de echte Supabase-tests draaien in CI. |

## Aannames

Zie `docs/OPENSTAANDE-KEUZES.md`.
