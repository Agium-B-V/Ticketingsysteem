export type TeamRol = 'handler' | 'admin';
export type Prioriteit = 'laag' | 'midden' | 'hoog';
export type Status = 'open' | 'in_behandeling' | 'afgerond' | 'geannuleerd';

export interface Team {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  is_admin_team: boolean;
  created_at: string;
}

export interface Profiel {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface Lidmaatschap {
  team_id: string;
  user_id: string;
  role: TeamRol;
}

export interface Ticket {
  id: string;
  number: string;
  team_id: string;
  submitter_id: string;
  submitter_name: string;
  subject: string;
  description: string;
  priority: Prioriteit;
  confidential: boolean;
  status: Status;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export type TicketRij = Omit<Ticket, 'description'>;

export interface Reactie {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  body: string;
  internal: boolean;
  created_at: string;
}

export interface Telling {
  team_id: string;
  status: Status;
  aantal: number;
}

export const TICKET_KOLOMMEN =
  'id, number, team_id, submitter_id, submitter_name, subject, priority, confidential, status, created_at, updated_at, closed_at';

export const TEAM_KOLOMMEN = 'id, name, prefix, active, is_admin_team, created_at';
