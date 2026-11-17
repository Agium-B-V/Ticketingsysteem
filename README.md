# Agium Ticketing

Een laagdrempelig ticketsysteem waarmee iedereen bij Agium vragen aan Finance en IT kan stellen. Nieuwe teams (bijvoorbeeld HR) voeg je toe zonder codewijziging. De app is een statische Vite + React-app. Supabase levert de database, het inloggen en Row Level Security (RLS). Er is geen eigen server.

Dit is een **pilot**. Hij wordt door één medewerker ingericht en beheerd, zonder Azure of Microsoft-login.

## Inhoud

1. [Hoe het werkt](#hoe-het-werkt)
2. [Supabase inrichten](#supabase-inrichten)
3. [Het eerste IT-admin-account (bootstrap)](#het-eerste-it-admin-account-bootstrap)
4. [GitHub Pages en GitHub secrets](#github-pages-en-github-secrets)
5. [Tijdelijke wachtwoorden veilig doorgeven](#tijdelijke-wachtwoorden-veilig-doorgeven)
6. [Supabase Free: pauzeren en back-ups](#supabase-free-pauzeren-en-back-ups)
7. [Overstappen naar Azure Static Web Apps](#overstappen-naar-azure-static-web-apps)
8. [Gegevens en bewaartermijn](#gegevens-en-bewaartermijn)
9. [Ontwikkelen en testen](#ontwikkelen-en-testen)
10. [Projectstructuur](#projectstructuur)

## Hoe het werkt

- **Inloggen** met e-mailadres en wachtwoord. Zelfregistratie staat uit: een IT-admin maakt accounts aan in de app. Bij de eerste login kies je een eigen wachtwoord.
- **Rollen** komen uitsluitend uit de tabel `team_members`: `handler` (behandelaar van een team) of `admin`. Admins van het IT-team zijn **IT-admins**: zij beheren teams en gebruikers. Iedereen die is ingelogd is medewerker en kan tickets indienen.
- **Zichtbaarheid**: niet-vertrouwelijke tickets zijn voor alle ingelogde collega's zichtbaar, zonder de reacties. Vertrouwelijke tickets ziet alleen de indiener en de behandelaars van het team. Hun bestaan lekt niet via lijsten, tellingen, zoeken, nummers of Realtime.
- **Afscherming** zit volledig in de database (RLS en kolomrechten) en in de Edge Functions. De frontend verbergt alleen knoppen. Zonder account kun je niets lezen, ook niet via de API.
- **Accountbeheer** loopt via vier Supabase Edge Functions. Alleen die gebruiken de service-role key, als Supabase-secret.

| Wat | Waar |
| --- | --- |
| Frontend | GitHub Pages (later Azure Static Web Apps) |
| Database, Auth, Realtime | Supabase (EU, Frankfurt) |
| Accountbeheer | Supabase Edge Functions `admin-create-user`, `admin-bulk-create-users`, `admin-reset-password`, `admin-set-active` |

## Supabase inrichten

Je hebt de [Supabase CLI](https://supabase.com/docs/guides/cli) nodig voor het deployen van de Edge Functions. Een volledige checklist met vinkjes staat in [`docs/CHECKLIST-OPDRACHTGEVER.md`](docs/CHECKLIST-OPDRACHTGEVER.md).

### 1. Project

Het project **Agium Ticketing** bestaat al. Controleer onder *Project Settings > General* dat de regio **EU Central (Frankfurt)** is. Een nieuw project maak je aan via *New project*, met regio Frankfurt.

### 2. Migraties

De migraties staan in [`supabase/migrations/`](supabase/migrations/). Het project is gekoppeld aan GitHub: **na een merge naar `main` past Supabase de migraties automatisch toe op de gekoppelde omgeving.** Een fout in RLS staat dan direct live. Daarom:

- draait de CI bij elke pull request de volledige RLS-testset tegen een lokale Supabase;
- merge je pas als de CI groen is.

Zonder GitHub-koppeling kan het ook handmatig:

```bash
supabase login
```

```bash
supabase link --project-ref <project-ref>
```

```bash
supabase db push
```

De migraties maken ook de teams **Finance (FIN)**, **IT (IT)** en **HR (HR)** aan. IT is het beheerteam.

### 3. Zelfregistratie uitzetten en wachtwoordregels

In het Supabase-dashboard:

1. *Authentication > Sign In / Providers*: zet **Allow new users to sign up** uit. Zet **Allow anonymous sign-ins** uit. Laat alleen **Email** aan, en zet magic link of OTP niet in de app aan.
2. *Authentication > Sign In / Providers > Email* (of *Authentication > Policies*, afhankelijk van de dashboardversie): stel **Minimum password length** in op **12**.
3. **Leaked password protection** (controle tegen gelekte wachtwoorden): zet deze aan als je plan dat toelaat. Op Free is dit niet beschikbaar.
4. *Authentication > URL Configuration*: zet **Site URL** op je GitHub Pages-URL (bijvoorbeeld `https://agium-b-v.github.io/Ticketingsysteem/`) en voeg die ook toe bij **Redirect URLs**.

De pilot gebruikt geen e-mailflows (geen wachtwoord-vergeten per e-mail). De ingebouwde mailservice van Supabase is alleen voor testen. Een zelfservice-reset vraagt later om een eigen SMTP-dienst.

### 4. Edge Functions deployen

```bash
supabase functions deploy admin-create-user admin-bulk-create-users admin-reset-password admin-set-active --project-ref <project-ref>
```

Zet daarna de configuratie als Supabase-secrets (nooit in GitHub of in de frontend):

```bash
supabase secrets set ALLOWED_EMAIL_DOMAINS=agium.nl --project-ref <project-ref>
```

```bash
supabase secrets set ALLOWED_ORIGINS=https://agium-b-v.github.io --project-ref <project-ref>
```

| Secret | Betekenis |
| --- | --- |
| `ALLOWED_EMAIL_DOMAINS` | Komma-gescheiden lijst met toegestane e-maildomeinen, bijvoorbeeld `agium.nl`. Zonder waarde weigeren de functies elk nieuw account. |
| `ALLOWED_ORIGINS` | Komma-gescheiden lijst met origins die de functies vanuit de browser mogen aanroepen. Alleen het domein, zonder pad: `https://agium-b-v.github.io`. Nooit `*`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Zet Supabase **automatisch** klaar voor elke Edge Function. Controleer onder *Edge Functions > Secrets* dat ze er staan. Je hoeft ze niet zelf in te stellen (de CLI weigert ook namen die met `SUPABASE_` beginnen). |

**De service-role key komt nooit in de frontend, in deze repository of in GitHub Actions.** Je hoeft hem nergens te plakken.

### 5. Realtime

De migratie zet de tabel `tickets` in de Realtime-publicatie. Realtime respecteert RLS: je krijgt alleen meldingen van tickets die je mag zien. Je hoeft niets in te stellen.

## Het eerste IT-admin-account (bootstrap)

Het allereerste account maak je met de hand. Daarna lopen alle accounts via de app.

1. Supabase-dashboard > *Authentication > Users > Add user > Create new user*. Vul je eigen e-mailadres en een sterk wachtwoord in en vink **Auto Confirm User** aan.
2. Open [`supabase/bootstrap-admin.sql`](supabase/bootstrap-admin.sql), kopieer de inhoud naar *SQL Editor* en vervang de twee plaatshouders door je e-mailadres en naam. Klik op **Run**. Bewaar het ingevulde script niet in de repository.
3. Open de app en log in. Je ziet nu het menu **Beheer**.

Het script maakt je profiel aan en koppelt je als `admin` aan het IT-team.

## GitHub Pages en GitHub secrets

1. *Settings > Secrets and variables > Actions > New repository secret*. Maak er precies twee aan:

   | Naam | Waarde |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project-URL uit Supabase (*Project Settings > API*), bijvoorbeeld `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | De **anon** (publieke) key uit dezelfde pagina. Nooit de service-role key. |

   De anon key komt per definitie in de gebouwde app terecht. Dat is veilig zolang RLS goed staat, en dat test de CI.

2. *Settings > Pages > Build and deployment > Source*: kies **GitHub Actions**.
3. Na een merge naar `main` bouwt [`deploy.yml`](.github/workflows/deploy.yml) de app en zet hem op `https://<organisatie>.github.io/<repo-naam>/`. De base path (`VITE_BASE_PATH`) vult de workflow zelf in met de reponaam.

Let op: de site op GitHub Pages is altijd publiek bereikbaar, ook vanuit een privérepository (en Pages vanuit een privérepository vraagt een betaald GitHub-plan). De pagina zelf is dus openbaar; de gegevens zijn beschermd door login en RLS.

Aanrader: zet onder *Settings > Branches* een regel op `main` die een groene CI vereist voordat je kunt mergen.

## Tijdelijke wachtwoorden veilig doorgeven

- De app toont een tijdelijk wachtwoord **één keer** na aanmaken of resetten, met een kopieerknop. Daarna is het nergens meer op te vragen.
- Geef het **persoonlijk** of via een **privéchat** door. **Nooit** in een groepskanaal, nooit per gedeelde mail en nooit in het ticketsysteem zelf.
- Bij een bulkimport download je één keer een overzicht met wachtwoorden. Verwijder dat bestand (en leeg de prullenbak) zodra iedereen zijn wachtwoord heeft.
- Bij de eerste login moet de gebruiker een eigen wachtwoord kiezen. Tot die tijd geeft de database hem geen toegang tot tickets.
- Wachtwoord vergeten? De IT-admin kiest *Beheer > Gebruikers > Beheren > Wachtwoord resetten*.
- Vertrekt een collega? *Beheer > Gebruikers > Beheren > Deactiveren*. Toegang stopt direct, ook met een nog geldige sessie. Tickets blijven bewaard.

## Supabase Free: pauzeren en back-ups

- **Free is prima voor de pilot.** Voor blijvend gebruik is een betaald plan (Pro) nodig.
- Een Free-project **pauzeert na ongeveer een week zonder activiteit**. De app werkt dan niet tot je het project hervat.
- **Hervatten**: log in op [supabase.com/dashboard](https://supabase.com/dashboard), open het project en klik op **Restore project** (of *Resume*). Dat duurt een paar minuten. Je gegevens blijven bewaard.
- Free heeft **beperkte back-ups** en geen point-in-time recovery. Maak bij belangrijke momenten zelf een export (*Database > Backups*, of `supabase db dump`). Bewaar zo'n export niet in deze repository.
- Leaked password protection en langere logbewaring zijn pas op betaalde plannen beschikbaar.

## Overstappen naar Azure Static Web Apps

Supabase blijft de auth- en datalaag. Alleen de hosting van de frontend verandert. Checklist:

1. **Static Web App aanmaken** in Azure (regio West-Europa), gekoppeld aan deze repository. Build-instellingen: app location `/`, output location `dist`, build command `npm run build`.
2. **Omgevingsvariabelen voor de build** (in de Azure-workflow, als GitHub secrets): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` en `VITE_BASE_PATH=/`.
3. **Normale routing (optioneel)**: vervang in [`src/App.tsx`](src/App.tsx) `HashRouter` door `BrowserRouter` (zelfde import uit `react-router-dom`). Zet in `public/` een `staticwebapp.config.json` zodat elke route naar `index.html` valt, en voeg daar de beveiligingsheaders toe:

   ```json
   {
     "navigationFallback": {
       "rewrite": "/index.html",
       "exclude": ["/assets/*", "/*.png", "/*.ico"]
     },
     "globalHeaders": {
       "X-Content-Type-Options": "nosniff",
       "Referrer-Policy": "no-referrer",
       "X-Frame-Options": "DENY",
       "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
     }
   }
   ```

   Houd je `HashRouter`, dan is de fallback niet nodig.
4. **CORS van de Edge Functions**: voeg de Azure-URL toe aan `ALLOWED_ORIGINS`, bijvoorbeeld `https://agium-b-v.github.io,https://<naam>.azurestaticapps.net`. Haal de GitHub Pages-URL weg zodra die niet meer wordt gebruikt.
5. **Supabase Auth**: voeg onder *Authentication > URL Configuration* de Azure-URL toe aan **Redirect URLs** en zet **Site URL** op de Azure-URL.
6. **Testen**: inloggen, ticket indienen, beheeracties (aanmaken, reset, deactiveren).
7. **GitHub Pages uitzetten**: verwijder `.github/workflows/deploy.yml` en zet *Settings > Pages* uit.

Er zit geen GitHub Pages-specifieke code in de app. De base path komt uit `VITE_BASE_PATH`.

## Gegevens en bewaartermijn

> Vul dit in na overleg met de verantwoordelijke voor privacy (AVG) binnen Agium. Er zijn bewust geen termijnen ingevuld.

| Gegeven | Waar opgeslagen | Doel | Bewaartermijn | Wie heeft toegang |
| --- | --- | --- | --- | --- |
| Naam en e-mailadres van medewerkers | Supabase (`auth.users`, `profiles`) | Inloggen, ticket koppelen | ______ | IT-admins |
| Tickets (onderwerp, omschrijving, naam indiener) | Supabase (`tickets`) | Vragen afhandelen | ______ | Zie RLS |
| Reacties en interne notities | Supabase (`ticket_comments`) | Vragen afhandelen | ______ | Indiener en team |
| Inloglogboek | Supabase Auth-logs | Beveiliging | ______ (plan-afhankelijk) | Projectbeheerder |

- Verwerkingsverantwoordelijke: ______
- Gemeld bij (privacy/AVG): ______ op ______
- Hoe en door wie worden gegevens na afloop van de termijn verwijderd: ______
- Verwerkersovereenkomst met Supabase: ______

## Ontwikkelen en testen

Vereist: Node.js 22 of nieuwer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

| Opdracht | Wat het doet |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript-controle |
| `npm test` | Unit-tests (validatie, wachtwoordgenerator, CSV) |
| `npm run build` | Productiebuild in `dist/` |
| `npm run test:db:lokaal` | RLS-testset tegen een tijdelijke Postgres zonder Docker (vereist `initdb`, `pg_ctl` en `psql` op het PATH). Gebruikt een nagebootst `auth`-schema en benadert de echte Supabase dus alleen. |
| `npm run test:db` | RLS-testset tegen `DATABASE_URL` (alleen lokale adressen toegestaan) |
| `npm run test:api` | REST-, Realtime- en Edge Function-tests tegen een lokale Supabase (`supabase start`) |

Met Docker draai je alles zoals de CI:

```bash
supabase start
```

```bash
supabase functions serve --env-file supabase/functions/test.env
```

Zet daarna `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` en `DATABASE_URL` uit `supabase status -o env` en draai `npm run test:db` en `npm run test:api`. Dat zijn lokale demo-sleutels, geen productiesleutels. De tests weigeren te draaien tegen iets anders dan `localhost` of `127.0.0.1`.

## Projectstructuur

```
.github/workflows/   ci.yml (lint, typecheck, build, tests incl. RLS) en deploy.yml (GitHub Pages)
docs/                bouwplan, openstaande keuzes, checklist, voorbeeld-CSV
public/              logo
scripts/             tijdelijke Postgres voor lokale RLS-tests
src/                 React-app (components, lib, pages, styles)
supabase/
  migrations/        schema, RLS, hulpfuncties, teams
  functions/         Edge Functions voor accountbeheer
  bootstrap-admin.sql
  config.toml        lokale Supabase (CI)
tests/               unit, db (RLS) en api
```

## Huisstijl

De interface volgt het Agium-designsysteem: kleuren, typografie (Inter) en componentstijl staan als tokens in [`src/styles/tokens.css`](src/styles/tokens.css). Het logo staat in `public/agium-logo.png`. Wil je de stijl aanpassen, doe dat alleen in de tokens.
