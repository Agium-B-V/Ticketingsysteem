-- Bootstrap: het allereerste IT-admin-account koppelen.
--
-- Eenmalig gebruiken. Daarna lopen alle accounts via de app (Beheer > Gebruikers).
--
-- Stappen
-- 1. Supabase-dashboard > Authentication > Users > Add user > Create new user.
--    Vul je e-mailadres en een sterk wachtwoord (minimaal 12 tekens) in en vink
--    "Auto Confirm User" aan.
-- 2. Vervang hieronder de twee plaatshouders (alleen tussen de aanhalingstekens).
-- 3. Plak dit script in Supabase-dashboard > SQL Editor en klik op Run.
--
-- Zet dit bestand NOOIT met echte gegevens terug in de repository.

do $$
declare
  c_email constant text := 'VUL_HIER_HET_EMAILADRES_IN';
  c_naam  constant text := 'VUL_HIER_DE_VOLLEDIGE_NAAM_IN';
  v_user_id uuid;
  v_it_team uuid;
begin
  if c_email like 'VUL_%' or c_naam like 'VUL_%' then
    raise exception 'Vervang eerst de plaatshouders voor e-mailadres en naam.';
  end if;

  select u.id into v_user_id from auth.users u where lower(u.email) = lower(c_email);
  if v_user_id is null then
    raise exception 'Geen gebruiker gevonden met dit e-mailadres. Maak het account eerst aan via Authentication > Users.';
  end if;

  select t.id into v_it_team from public.teams t where t.is_admin_team;
  if v_it_team is null then
    raise exception 'Het IT-team ontbreekt. Zijn de migraties toegepast?';
  end if;

  -- Je hebt het wachtwoord zelf gekozen, dus geen verplichte wijziging.
  insert into public.profiles (id, full_name, email, active, must_change_password)
  values (v_user_id, btrim(c_naam), lower(btrim(c_email)), true, false)
  on conflict (id) do update
    set full_name = excluded.full_name,
        active = true;

  insert into public.team_members (team_id, user_id, role)
  values (v_it_team, v_user_id, 'admin')
  on conflict (team_id, user_id) do update set role = 'admin';

  raise notice 'Klaar: % is nu IT-admin.', lower(btrim(c_email));
end;
$$;
