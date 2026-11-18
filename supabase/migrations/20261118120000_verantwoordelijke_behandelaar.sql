-- Verantwoordelijke behandelaar per ticket.
--
-- * Behandelaars en admins van het team (team_members) kunnen een
--   verantwoordelijke kiezen uit de actieve leden van datzelfde team.
-- * De naam wordt door een trigger uit het profiel overgenomen
--   (assignee_name), net als author_name bij reacties. Zo hoeft niemand het
--   profiel van een teamgenoot te kunnen lezen.
-- * Een indiener die geen behandelaar is kan de verantwoordelijke niet zetten.

-- ---------------------------------------------------------------------------
-- 1. Kolommen
-- ---------------------------------------------------------------------------

alter table public.tickets
  add column assignee_id uuid references public.profiles (id) on delete set null,
  add column assignee_name text,
  add constraint tickets_assignee_consistent check ((assignee_id is null) = (assignee_name is null));

create index tickets_assignee_idx on public.tickets (assignee_id);

-- ---------------------------------------------------------------------------
-- 2. Trigger: verantwoordelijke controleren en naam zetten
-- ---------------------------------------------------------------------------

-- security definer is nodig om lidmaatschap en naam van een teamgenoot te
-- lezen; de functie controleert daarom zelf dat de aanroeper behandelaar van
-- het team is. Draait na tickets_before_update (triggers gaan op naam).
create or replace function public.tickets_set_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.assignee_id is not distinct from old.assignee_id then
    new.assignee_name := old.assignee_name;
    return new;
  end if;

  if (select auth.uid()) is not null and not public.is_team_handler(old.team_id) then
    raise exception 'Alleen behandelaars van het team kunnen een verantwoordelijke kiezen' using errcode = '42501';
  end if;

  if new.assignee_id is null then
    new.assignee_name := null;
    return new;
  end if;

  select p.full_name into v_name
    from public.team_members tm
    join public.profiles p on p.id = tm.user_id
   where tm.team_id = old.team_id
     and tm.user_id = new.assignee_id
     and p.active;

  if v_name is null then
    raise exception 'Kies een actieve behandelaar of admin van dit team' using errcode = '42501';
  end if;

  new.assignee_name := v_name;
  return new;
end;
$$;

create trigger tickets_set_assignee
  before update on public.tickets
  for each row execute function public.tickets_set_assignee();

-- Bij indienen is er nog geen verantwoordelijke (geen kolomrecht op insert;
-- dit dekt ook service_role af).
create or replace function public.tickets_clear_assignee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.assignee_id := null;
  new.assignee_name := null;
  return new;
end;
$$;

create trigger tickets_clear_assignee
  before insert on public.tickets
  for each row execute function public.tickets_clear_assignee();

-- ---------------------------------------------------------------------------
-- 3. Keuzelijst: behandelaars en admins van een team
-- ---------------------------------------------------------------------------

-- Geeft alleen iets terug als de aanroeper zelf behandelaar of admin van het
-- team is. Alleen naam en rol, geen e-mailadres.
create or replace function public.team_behandelaars(p_team_id uuid)
returns table (user_id uuid, full_name text, role public.team_role)
language sql
stable
security definer
set search_path = ''
as $$
  select tm.user_id, p.full_name, tm.role
    from public.team_members tm
    join public.profiles p on p.id = tm.user_id
   where tm.team_id = p_team_id
     and p.active
     and public.is_team_handler(p_team_id)
   order by p.full_name;
$$;

-- ---------------------------------------------------------------------------
-- 4. Rechten
-- ---------------------------------------------------------------------------

revoke execute on function public.tickets_set_assignee() from public, anon, authenticated;
revoke execute on function public.tickets_clear_assignee() from public, anon, authenticated;
revoke execute on function public.team_behandelaars(uuid) from public, anon;

grant update (assignee_id) on public.tickets to authenticated;
grant execute on function public.team_behandelaars(uuid) to authenticated;
grant execute on function public.tickets_set_assignee() to service_role;
grant execute on function public.tickets_clear_assignee() to service_role;
grant execute on function public.team_behandelaars(uuid) to service_role;
