-- Agium Ticketing: schema, hulpfuncties, triggers, rechten en Row Level Security.
--
-- Uitgangspunten
-- * Alle autorisatie zit hier (RLS + kolomrechten + triggers), niet in de frontend.
-- * De rol `anon` krijgt nergens rechten op.
-- * Rol en team komen uitsluitend uit public.team_members, nooit uit JWT-claims
--   of user_metadata die de gebruiker zelf kan wijzigen.
-- * Elke policy weegt has_access() mee: het profiel is actief en het tijdelijke
--   wachtwoord is gewijzigd. Een gedeactiveerde gebruiker met een nog geldig
--   token krijgt daardoor niets terug.
-- * security definer-functies hebben een lege search_path, gebruiken volledig
--   gekwalificeerde namen en geven alleen informatie over de aanroeper zelf of
--   controleren expliciet de rechten.

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------

create type public.team_role as enum ('handler', 'admin');
create type public.ticket_priority as enum ('laag', 'midden', 'hoog');
create type public.ticket_status as enum ('open', 'in_behandeling', 'afgerond', 'geannuleerd');

-- ---------------------------------------------------------------------------
-- 2. Tabellen
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text not null,
  -- Volgnummer voor niet-vertrouwelijke tickets (FIN-0001).
  ticket_counter integer not null default 0,
  -- Aparte reeks voor vertrouwelijke tickets (FIN-V-0001), zodat gaten in de
  -- openbare nummering het bestaan van vertrouwelijke tickets niet verraden.
  confidential_counter integer not null default 0,
  -- Precies één team is het beheerteam (IT). Alleen via een migratie te zetten.
  is_admin_team boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint teams_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint teams_prefix_format check (prefix ~ '^[A-Z]{2,6}$'),
  constraint teams_counters_positive check (ticket_counter >= 0 and confidential_counter >= 0),
  constraint teams_prefix_unique unique (prefix)
);

create unique index teams_name_unique on public.teams (lower(btrim(name)));
create unique index teams_single_admin_team on public.teams (is_admin_team) where is_admin_team;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(btrim(full_name)) between 1 and 120),
  constraint profiles_email_format check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint profiles_email_unique unique (email)
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  team_id uuid not null references public.teams (id) on delete restrict,
  submitter_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  submitter_name text not null,
  subject text not null,
  description text not null,
  priority public.ticket_priority not null default 'midden',
  confidential boolean not null default false,
  status public.ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint tickets_number_unique unique (number),
  constraint tickets_submitter_name_length check (char_length(btrim(submitter_name)) between 1 and 120),
  constraint tickets_subject_length check (char_length(btrim(subject)) between 1 and 200),
  constraint tickets_description_length check (char_length(btrim(description)) between 1 and 10000),
  constraint tickets_closed_at_consistent check (
    (status in ('afgerond', 'geannuleerd')) = (closed_at is not null)
  )
);

create index tickets_team_idx on public.tickets (team_id);
create index tickets_submitter_idx on public.tickets (submitter_id);
create index tickets_status_idx on public.tickets (status);
create index tickets_created_idx on public.tickets (created_at desc);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  -- Naam van de auteur op het moment van schrijven (gezet door trigger), zodat
  -- de indiener de naam van de behandelaar ziet zonder diens profiel te lezen.
  author_name text not null default '',
  body text not null,
  -- true = interne notitie, alleen zichtbaar voor behandelaars van het team.
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ticket_comments_body_length check (char_length(btrim(body)) between 1 and 5000)
);

create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

-- Privéschema voor gegevens die nooit via de API bereikbaar mogen zijn.
create schema if not exists private;
revoke all on schema private from public;

-- Hash van het tijdelijke wachtwoord. mark_password_changed() vergelijkt de
-- huidige hash hiermee, zodat de verplichte wijziging niet over te slaan is.
create table private.password_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);

revoke all on private.password_snapshots from public;

-- ---------------------------------------------------------------------------
-- 3. Hulpfuncties (security definer, vaste search_path)
--    Deze functies geven uitsluitend informatie over de ingelogde aanroeper.
-- ---------------------------------------------------------------------------

-- Is het account van de aanroeper actief?
create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.active from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- Heeft de aanroeper toegang tot gegevens? Actief en tijdelijk wachtwoord gewijzigd.
create or replace function public.has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.active and not p.must_change_password
       from public.profiles p
      where p.id = (select auth.uid())),
    false
  );
$$;

-- Is de aanroeper behandelaar (handler of admin) van dit team?
create or replace function public.is_team_handler(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_access()
     and exists (
       select 1
         from public.team_members tm
        where tm.team_id = p_team_id
          and tm.user_id = (select auth.uid())
     );
$$;

-- Is de aanroeper admin van het beheerteam (IT)?
create or replace function public.is_it_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_access()
     and exists (
       select 1
         from public.team_members tm
         join public.teams t on t.id = tm.team_id
        where tm.user_id = (select auth.uid())
          and tm.role = 'admin'
          and t.is_admin_team
     );
$$;

-- Zet must_change_password uit voor de aanroeper, maar alleen als het
-- wachtwoord echt is gewijzigd ten opzichte van het tijdelijke wachtwoord.
create or replace function public.mark_password_changed()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current text;
  v_snapshot text;
begin
  if v_uid is null or not public.is_active() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  select u.encrypted_password into v_current from auth.users u where u.id = v_uid;
  select s.encrypted_password into v_snapshot from private.password_snapshots s where s.user_id = v_uid;

  if v_snapshot is not null and v_current is not distinct from v_snapshot then
    raise exception 'Stel eerst een nieuw wachtwoord in' using errcode = 'P0001';
  end if;

  update public.profiles set must_change_password = false where id = v_uid;
  delete from private.password_snapshots where user_id = v_uid;
end;
$$;

-- Slaat de hash van een (tijdelijk) wachtwoord op. Alleen uitvoerbaar door
-- service_role (de Edge Functions); zie de grants onderaan.
create or replace function public.admin_snapshot_password(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.password_snapshots (user_id, encrypted_password)
  select u.id, u.encrypted_password
    from auth.users u
   where u.id = p_user_id
     and u.encrypted_password is not null
  on conflict (user_id) do update
    set encrypted_password = excluded.encrypted_password,
        created_at = now();
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- Ticketnummer: verhoogt de teller van het team atomair (rijvergrendeling via
-- UPDATE ... RETURNING), zodat gelijktijdige inzendingen nooit hetzelfde
-- nummer krijgen. Bij een mislukte insert wordt de verhoging teruggedraaid.
-- security definer is nodig om de teller bij te werken; de functie controleert
-- daarom zelf dat de aanroeper toegang heeft en voor zichzelf indient.
create or replace function public.tickets_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prefix text;
  v_seq integer;
begin
  if v_uid is not null then
    if not public.has_access() then
      raise exception 'Geen toegang' using errcode = '42501';
    end if;
    if new.submitter_id is distinct from v_uid then
      raise exception 'Je kunt alleen namens jezelf een ticket indienen' using errcode = '42501';
    end if;
  end if;

  if new.confidential then
    update public.teams
       set confidential_counter = confidential_counter + 1
     where id = new.team_id and active
    returning prefix, confidential_counter into v_prefix, v_seq;
  else
    update public.teams
       set ticket_counter = ticket_counter + 1
     where id = new.team_id and active
    returning prefix, ticket_counter into v_prefix, v_seq;
  end if;

  if v_prefix is null then
    raise exception 'Dit team bestaat niet of is niet actief' using errcode = '23503';
  end if;

  new.number := v_prefix
    || case when new.confidential then '-V-' else '-' end
    || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end;
  new.created_at := now();
  new.updated_at := now();
  new.closed_at := null;
  return new;
end;
$$;

create trigger tickets_before_insert
  before insert on public.tickets
  for each row execute function public.tickets_before_insert();

-- Bewaakt wijzigingen: vaste velden blijven gelijk, een indiener die geen
-- behandelaar is mag alleen een open ticket annuleren. Zet updated_at en closed_at.
create or replace function public.tickets_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.number <> old.number
     or new.team_id <> old.team_id
     or new.submitter_id <> old.submitter_id
     or new.submitter_name <> old.submitter_name
     or new.subject <> old.subject
     or new.description <> old.description
     or new.confidential <> old.confidential
     or new.created_at <> old.created_at then
    raise exception 'Deze velden kunnen niet worden gewijzigd' using errcode = '42501';
  end if;

  if (select auth.uid()) is not null and not public.is_team_handler(old.team_id) then
    if not (
      old.submitter_id = (select auth.uid())
      and old.status = 'open'
      and new.status = 'geannuleerd'
      and new.priority = old.priority
    ) then
      raise exception 'Je kunt dit ticket alleen annuleren zolang het open is' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();

  if new.status in ('afgerond', 'geannuleerd') then
    if old.status in ('afgerond', 'geannuleerd') and old.closed_at is not null then
      new.closed_at := old.closed_at;
    else
      new.closed_at := now();
    end if;
  else
    new.closed_at := null;
  end if;

  return new;
end;
$$;

create trigger tickets_before_update
  before update on public.tickets
  for each row execute function public.tickets_before_update();

-- Reacties: auteursnaam uit het profiel van de auteur, tijdstip vast.
create or replace function public.ticket_comments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  select p.full_name into v_name from public.profiles p where p.id = new.author_id;
  if v_name is null then
    raise exception 'Onbekende auteur' using errcode = '42501';
  end if;
  new.author_name := v_name;
  new.created_at := now();
  return new;
end;
$$;

create trigger ticket_comments_before_insert
  before insert on public.ticket_comments
  for each row execute function public.ticket_comments_before_insert();

-- Teams: prefix en beheerteam-vlag zijn vast; het beheerteam blijft actief.
create or replace function public.teams_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.prefix <> old.prefix or new.is_admin_team <> old.is_admin_team then
    raise exception 'Prefix en beheerteam kunnen niet worden gewijzigd' using errcode = '42501';
  end if;
  if old.is_admin_team and not new.active then
    raise exception 'Het IT-team kan niet worden gedeactiveerd' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger teams_before_update
  before update on public.teams
  for each row execute function public.teams_before_update();

-- Voorkomt dat de laatste actieve IT-admin verdwijnt (buitensluiten).
create or replace function public.team_members_protect_last_it_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_team uuid;
  v_remaining integer;
begin
  select t.id into v_admin_team from public.teams t where t.is_admin_team;

  if old.team_id = v_admin_team
     and old.role = 'admin'
     and (tg_op = 'DELETE'
          or new.role <> 'admin'
          or new.team_id <> old.team_id
          or new.user_id <> old.user_id) then
    select count(*) into v_remaining
      from public.team_members tm
      join public.profiles p on p.id = tm.user_id
     where tm.team_id = v_admin_team
       and tm.role = 'admin'
       and p.active
       and tm.user_id <> old.user_id;
    if v_remaining = 0 then
      raise exception 'Er moet minimaal één actieve IT-admin overblijven' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger team_members_protect_last_it_admin
  before update or delete on public.team_members
  for each row execute function public.team_members_protect_last_it_admin();

-- ---------------------------------------------------------------------------
-- 5. Views (security_invoker: RLS van de aanroeper geldt)
-- ---------------------------------------------------------------------------

create view public.ticket_counts
with (security_invoker = true)
as
  select t.team_id, t.status, count(*)::integer as aantal
    from public.tickets t
   group by t.team_id, t.status;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table private.password_snapshots enable row level security;

-- teams: lezen voor ingelogde gebruikers met toegang; schrijven alleen IT-admin.
create policy teams_select on public.teams
  for select to authenticated
  using (public.has_access());

create policy teams_insert on public.teams
  for insert to authenticated
  with check (public.is_it_admin());

create policy teams_update on public.teams
  for update to authenticated
  using (public.is_it_admin())
  with check (public.is_it_admin());

-- profiles: eigen profiel (ook met tijdelijk wachtwoord, zodat de app kan
-- doorsturen), IT-admins alles, handlers de indieners van tickets van hun team.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) and public.is_active());

create policy profiles_select_it_admin on public.profiles
  for select to authenticated
  using (public.is_it_admin());

create policy profiles_select_handler on public.profiles
  for select to authenticated
  using (
    public.has_access()
    and exists (
      select 1
        from public.tickets t
       where t.submitter_id = profiles.id
         and public.is_team_handler(t.team_id)
    )
  );

-- Alleen full_name is via kolomrechten wijzigbaar (zie grants).
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.has_access())
  with check (id = (select auth.uid()));

-- team_members: eigen lidmaatschappen lezen; alles alleen voor IT-admins.
create policy team_members_select on public.team_members
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.has_access())
    or public.is_it_admin()
  );

create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (public.is_it_admin());

create policy team_members_update on public.team_members
  for update to authenticated
  using (public.is_it_admin())
  with check (public.is_it_admin());

create policy team_members_delete on public.team_members
  for delete to authenticated
  using (public.is_it_admin());

-- tickets
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    public.has_access()
    and (
      not confidential
      or submitter_id = (select auth.uid())
      or public.is_team_handler(team_id)
    )
  );

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    public.has_access()
    and submitter_id = (select auth.uid())
    and status = 'open'
  );

create policy tickets_update_handler on public.tickets
  for update to authenticated
  using (public.is_team_handler(team_id))
  with check (public.is_team_handler(team_id));

create policy tickets_update_cancel_own on public.tickets
  for update to authenticated
  using (
    public.has_access()
    and submitter_id = (select auth.uid())
    and status = 'open'
  )
  with check (
    submitter_id = (select auth.uid())
    and status = 'geannuleerd'
  );

-- Geen delete-policy: verwijderen kan niet, alleen annuleren.

-- ticket_comments: interne notities alleen voor handlers van het team;
-- overige reacties alleen voor indiener en handlers (ook bij openbare tickets).
create policy ticket_comments_select on public.ticket_comments
  for select to authenticated
  using (
    public.has_access()
    and exists (
      select 1
        from public.tickets t
       where t.id = ticket_comments.ticket_id
         and (
           public.is_team_handler(t.team_id)
           or (not ticket_comments.internal and t.submitter_id = (select auth.uid()))
         )
    )
  );

create policy ticket_comments_insert on public.ticket_comments
  for insert to authenticated
  with check (
    public.has_access()
    and author_id = (select auth.uid())
    and exists (
      select 1
        from public.tickets t
       where t.id = ticket_comments.ticket_id
         and (
           public.is_team_handler(t.team_id)
           or (not ticket_comments.internal and t.submitter_id = (select auth.uid()))
         )
    )
  );

-- Geen update- of delete-policy op reacties.

-- ---------------------------------------------------------------------------
-- 7. Rechten
-- ---------------------------------------------------------------------------

-- Eerst alles intrekken voor anon, authenticated en PUBLIC ...
revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke execute on all functions in schema public from anon, authenticated, public;
revoke all on all tables in schema private from anon, authenticated, public;

-- ... en voor toekomstige objecten nooit automatisch iets aan anon geven.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Daarna alleen wat `authenticated` nodig heeft; RLS bepaalt welke rijen.
grant select (id, name, prefix, is_admin_team, active, created_at) on public.teams to authenticated;
grant insert (name, prefix, active) on public.teams to authenticated;
grant update (name, active) on public.teams to authenticated;

grant select (id, full_name, email, active, must_change_password, created_at) on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select, delete on public.team_members to authenticated;
grant insert (team_id, user_id, role) on public.team_members to authenticated;
grant update (role) on public.team_members to authenticated;

grant select on public.tickets to authenticated;
grant insert (team_id, submitter_id, submitter_name, subject, description, priority, confidential)
  on public.tickets to authenticated;
grant update (status, priority) on public.tickets to authenticated;

grant select on public.ticket_comments to authenticated;
grant insert (ticket_id, author_id, body, internal) on public.ticket_comments to authenticated;

grant select on public.ticket_counts to authenticated;

grant execute on function public.is_active() to authenticated;
grant execute on function public.has_access() to authenticated;
grant execute on function public.is_team_handler(uuid) to authenticated;
grant execute on function public.is_it_admin() to authenticated;
grant execute on function public.mark_password_changed() to authenticated;

-- service_role (alleen in de Edge Functions) mag alles; RLS geldt daar niet.
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant usage on schema private to service_role;
grant all on private.password_snapshots to service_role;

-- ---------------------------------------------------------------------------
-- 8. Realtime: alleen tickets (RLS geldt ook voor Realtime-abonnees).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tickets;
  end if;
end;
$$;
