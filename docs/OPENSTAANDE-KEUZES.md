# Openstaande keuzes en aannames

Bij elke open keuze is de veiligste of strengste optie gekozen. Hieronder staat per punt wat er is gekozen en hoe je het kunt aanpassen.

| # | Onderwerp | Gekozen | Waarom | Aanpassen |
| --- | --- | --- | --- | --- |
| 1 | Wie beheert teamleden? De specificatie zegt dat `admin` "leden van het eigen team kan beheren", maar ook dat alleen IT-admins gebruikers aan teams koppelen. | Alleen IT-admins koppelen gebruikers aan teams. De rol `admin` buiten IT werkt nu als `handler`. | Strengste lezing; voorkomt dat een teamadmin zichzelf of anderen rechten geeft. | Extra policy op `team_members` met `is_team_admin(team_id)`. |
| 2 | Nummering van vertrouwelijke tickets | Eigen reeks per team: `FIN-V-0001`. Openbare tickets: `FIN-0001`. | Bij één gedeelde reeks verraden de gaten in de openbare lijst dat er vertrouwelijke tickets bestaan. | Trigger `tickets_before_insert` aanpassen. |
| 3 | Leesbaarheid van `teams.ticket_counter` | Niet leesbaar voor gebruikers (kolomrechten). | De teller verraadt het totaal, inclusief vertrouwelijke tickets. | `grant select (ticket_counter, ...)`. |
| 4 | Toegang met tijdelijk wachtwoord | Zolang `must_change_password` aan staat, geeft de database alleen het eigen profiel terug. | Het tijdelijke wachtwoord gaat via chat; daarmee mag je nog niet bij tickets. | `has_access()` aanpassen. |
| 5 | `must_change_password` uitzetten | Kan alleen via `mark_password_changed()`, en alleen als het wachtwoord echt anders is dan het tijdelijke (hashvergelijking). | Voorkomt dat iemand de verplichte wijziging overslaat door de API direct aan te roepen. | n.v.t. |
| 6 | Handlers zien profielen van indieners | Alleen van indieners van tickets van hun eigen team(s). | Strengste lezing van "tickets die ze mogen zien". De naam staat al op het ticket (`submitter_name`). | Policy op `profiles`. |
| 7 | Prefix van een team wijzigen | Kan niet na aanmaken; naam en actief wel. | Bestaande ticketnummers blijven consistent. | Kolomrecht `update (prefix)`. |
| 8 | Welk team is "het IT-team" voor `is_it_admin()`? | Kolom `teams.is_admin_team` (alleen via migratie te zetten, alleen één team). | Hangt niet af van een naam of prefix die later kan wijzigen. | Migratie. |
| 9 | Laatste IT-admin | Kan niet worden verwijderd of gedegradeerd; een IT-admin kan zichzelf niet deactiveren. | Voorkomt dat je jezelf buitensluit. | Trigger `team_members_protect_last_it_admin`. |
| 10 | Toegestane e-maildomeinen | Via Supabase-secret `ALLOWED_EMAIL_DOMAINS` (komma-gescheiden). Zonder waarde weigeren de functies alles. | Configureerbaar, en de functies vallen veilig terug als de waarde ontbreekt. | Secret instellen. |
| 11 | CORS-origin van de Edge Functions | Via secret `ALLOWED_ORIGINS` (komma-gescheiden, nooit `*`). Zonder waarde wordt geen enkele browser-origin toegestaan. | Werkwijze punt 5 en spec sectie 3. | Secret aanpassen bij overstap naar Azure. |
| 12 | Reacties op niet-vertrouwelijke tickets | Alleen indiener en handlers van het team. | Specificatie sectie 5. | Policy `ticket_comments_select`. |
| 13 | Indiener wijzigt ticket | Alleen annuleren zolang status `open` is. Geen wijziging van onderwerp, omschrijving of vertrouwelijkheid na indienen. | Specificatie sectie 5. | n.v.t. |
| 14 | Sessie na reset of deactivatie | Een bestaand token blijft geldig tot het verloopt (standaard 1 uur), maar RLS en de functies geven niets terug zodra `active = false`. Na een wachtwoordreset staat `must_change_password` weer aan, waardoor het oude token geen tickets meer ziet. | Supabase kan sessies van een ander niet direct intrekken zonder hun token. | JWT-verlooptijd in Supabase verlagen. |
| 15 | Sessieopslag in de browser | `localStorage` (standaard van Supabase), zodat je ingelogd blijft na herladen. | Gebruikersgemak; op gedeelde pc's moet je uitloggen. | `persistSession`/`storage` in `src/lib/supabase.ts`. |
| 16 | Lettertype | Inter, zelf gehost via `@fontsource/inter` in plaats van Google Fonts. | Geen verzoeken naar Google bij elk bezoek (privacy). | n.v.t. |
| 17 | Iconen | `lucide-react` via npm, gebundeld. | Huisstijl schrijft Lucide voor; geen CDN nodig. | n.v.t. |
| 18 | Teams | Finance (FIN), IT (IT, beheerteam) en HR (HR) staan in een migratie, zodat productie ze ook krijgt. | Seed-bestanden draaien niet op productie. | Migratie. |
| 19 | Realtime | Alleen `tickets` staat in de Realtime-publicatie, `ticket_comments` niet. | Minder oppervlak; reacties ververs je bij openen. | `alter publication supabase_realtime add table ...`. |
| 20 | E-mailnotificaties | Buiten scope. Het datamodel (statuswijzigingen, reacties met tijdstempel) maakt een latere Edge Function of database-webhook mogelijk. | Specificatie sectie 9. | n.v.t. |
| 21 | Ticketdetail-URL | Op ticketnummer (`#/tickets/FIN-0007`). Een nummer dat je niet mag zien geeft dezelfde melding als een nummer dat niet bestaat. | Geen verschil tussen "bestaat niet" en "geen toegang". | n.v.t. |
