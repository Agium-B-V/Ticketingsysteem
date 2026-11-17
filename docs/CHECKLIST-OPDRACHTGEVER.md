# Checklist voor de opdrachtgever

Alles wat je zelf moet doen, in volgorde. Waar een opdracht staat, is het alleen nog plakken en uitvoeren. Vervang `<project-ref>` door de referentie van je Supabase-project (de code in de project-URL `https://<project-ref>.supabase.co`).

## A. Voor de merge

1. **Pull request beoordelen.** Lees de PR-beschrijving en controleer dat de CI groen is. Vooral de job *RLS- en API-tests tegen lokale Supabase* moet slagen.
2. **Regio controleren.** Supabase-dashboard > *Project Settings > General*: regio is **EU Central (Frankfurt)**.
3. **Zelfregistratie uit.** *Authentication > Sign In / Providers*: zet **Allow new users to sign up** uit en **Allow anonymous sign-ins** uit. Laat bij **Email** de opties **Confirm email** en **Secure email change** **aan** staan, ook al gebruikt de pilot geen e-mail: zo kan niemand zelf zijn login-e-mailadres wijzigen. (De database weigert daarnaast toegang als het adres afwijkt van het profiel.)
4. **Wachtwoordlengte.** *Authentication > Sign In / Providers > Email* (of *Policies*): **Minimum password length = 12**. Zet **Leaked password protection** aan als je plan dat toelaat.
5. **URL's.** *Authentication > URL Configuration*: **Site URL** = `https://agium-b-v.github.io/Ticketingsysteem/` en dezelfde URL bij **Redirect URLs**. (Pas aan als de reponaam of organisatie anders is.)
6. **Branchbeveiliging (aanrader).** GitHub > *Settings > Branches*: regel op `main` die een groene CI vereist.

## B. Merge en database

7. **Mergen.** Merge de pull request naar `main`. De Supabase-GitHub-koppeling past de migraties toe op de gekoppelde omgeving. Controleer in het dashboard onder *Database > Migrations* (of *Table Editor*) dat de tabellen `teams`, `profiles`, `team_members`, `tickets` en `ticket_comments` bestaan en dat **RLS enabled** bij alle vijf staat.

## C. Edge Functions

8. **Supabase CLI installeren** (eenmalig): zie <https://supabase.com/docs/guides/cli>.
9. **Inloggen en deployen:**

   ```bash
   supabase login
   ```

   ```bash
   supabase functions deploy admin-create-user admin-bulk-create-users admin-reset-password admin-set-active --project-ref <project-ref>
   ```

10. **Secrets instellen** (alleen in Supabase):

    ```bash
    supabase secrets set ALLOWED_EMAIL_DOMAINS=agium.nl --project-ref <project-ref>
    ```

    ```bash
    supabase secrets set ALLOWED_ORIGINS=https://agium-b-v.github.io --project-ref <project-ref>
    ```

11. **Service-role key controleren.** *Edge Functions > Secrets*: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` en `SUPABASE_ANON_KEY` staan er automatisch. Zet de service-role key **nergens** anders neer: niet in GitHub, niet in de frontend en niet in een bestand.

## D. Eerste IT-admin

12. *Authentication > Users > Add user > Create new user*: je eigen e-mailadres, een sterk wachtwoord (minimaal 12 tekens) en **Auto Confirm User** aan.
13. Open `supabase/bootstrap-admin.sql`, vervang de twee plaatshouders, plak het in *SQL Editor* en klik op **Run**. Sla het ingevulde script niet op in de repository.

## E. GitHub Pages

14. GitHub > *Settings > Secrets and variables > Actions*: maak **`VITE_SUPABASE_URL`** (project-URL) en **`VITE_SUPABASE_ANON_KEY`** (de **anon**/publieke key) aan. Niets anders.
15. GitHub > *Settings > Pages > Source*: **GitHub Actions**.
16. GitHub > *Actions > Deploy naar GitHub Pages > Run workflow* (of wacht op de volgende push naar `main`).
17. Controleer of de repository publiek of privé is. Pages vanuit een privérepository vraagt een betaald GitHub-plan; de site is in beide gevallen publiek bereikbaar.

## F. Testen in productie

18. Open de site en log in met je admin-account. Je ziet **Beheer**.
19. Maak via *Beheer > Gebruikers* een testaccount aan, log in een privévenster in met het tijdelijke wachtwoord, kies een eigen wachtwoord en dien een vertrouwelijk en een openbaar ticket in.
20. Controleer als admin dat je het vertrouwelijke ticket alleen ziet als je behandelaar van dat team bent. Deactiveer daarna het testaccount.

## G. Organisatorisch

21. **Privacy (AVG).** Meld de pilot kort bij wie binnen Agium over privacy gaat. Leg vast welke gegevens erin staan (namen, e-mailadressen, mogelijk gevoelige vragen) en hoe lang ze bewaard blijven. Vul de paragraaf *Gegevens en bewaartermijn* in de README in.
22. **Plan.** Free is genoeg voor de pilot. Het project pauzeert na ongeveer een week zonder activiteit (hervatten: dashboard > project > *Restore project*). Ga bij blijvend gebruik naar een betaald plan.
23. **Huisstijl.** De app gebruikt de Agium-tokens uit het designsysteem. Laat een collega van marketing kijken of kleuren, lettertype en logo goed zijn toegepast.
