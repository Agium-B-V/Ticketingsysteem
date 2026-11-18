-- Startteams. Bewust een migratie (en geen seed.sql), zodat ook de gekoppelde
-- productieomgeving deze teams krijgt. Bevat geen personen.
-- IT is het beheerteam: admins van dit team zijn IT-admins (is_it_admin()).

insert into public.teams (name, prefix, is_admin_team)
values
  ('Finance', 'FIN', false),
  ('IT', 'IT', true),
  ('HR', 'HR', false)
on conflict (prefix) do nothing;
