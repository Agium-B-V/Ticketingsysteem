import { ArrowDown, ArrowUp, Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamNaam } from '../lib/auth';
import { datum, datumTijd, PRIORITEIT_GEWICHT, PRIORITEIT_LABEL, PRIORITEITEN, STATUS_LABEL, STATUSSEN } from '../lib/format';
import type { Prioriteit, Status, Team, TicketRij } from '../lib/types';
import { PrioriteitBadge, StatusBadge, VertrouwelijkBadge } from './TicketBadges';
import { Badge, Kaart, Keuzelijst, Leeg } from './ui';

type SorteerOp = 'created_at' | 'updated_at' | 'priority';

interface Props {
  tickets: TicketRij[];
  teams: Team[];
  titel: string;
  legeTekst: string;
  toonBijgewerkt?: boolean;
  /** Teams waarvan de gebruiker behandelaar is; andere tickets krijgen het label Alleen lezen. */
  handlerTeams?: Set<string>;
  standaardStatus?: Status | '';
}

export function TicketLijst({ tickets, teams, titel, legeTekst, toonBijgewerkt, handlerTeams, standaardStatus = '' }: Props) {
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<Status | ''>(standaardStatus);
  const [prioriteit, setPrioriteit] = useState<Prioriteit | ''>('');
  const [sorteer, setSorteer] = useState<SorteerOp>(toonBijgewerkt ? 'updated_at' : 'created_at');
  const [oplopend, setOplopend] = useState(false);

  const zichtbareTeams = useMemo(() => {
    const ids = new Set(tickets.map((t) => t.team_id));
    return teams.filter((t) => ids.has(t.id));
  }, [tickets, teams]);

  const gefilterd = useMemo(() => {
    const lijst = tickets.filter(
      (t) => (!team || t.team_id === team) && (!status || t.status === status) && (!prioriteit || t.priority === prioriteit),
    );
    const factor = oplopend ? 1 : -1;
    return [...lijst].sort((a, b) => {
      const v =
        sorteer === 'priority'
          ? PRIORITEIT_GEWICHT[a.priority] - PRIORITEIT_GEWICHT[b.priority]
          : a[sorteer].localeCompare(b[sorteer]);
      return v * factor || b.created_at.localeCompare(a.created_at);
    });
  }, [tickets, team, status, prioriteit, sorteer, oplopend]);

  const wisselSortering = (op: SorteerOp) => {
    if (op === sorteer) setOplopend((o) => !o);
    else {
      setSorteer(op);
      setOplopend(false);
    }
  };

  const sorteerKop = (op: SorteerOp, label: string) => (
    <th aria-sort={sorteer === op ? (oplopend ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sorteerknop" onClick={() => wisselSortering(op)}>
        {label}
        {sorteer === op && (oplopend ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
      </button>
    </th>
  );

  const alleenLezen = (t: TicketRij) => handlerTeams !== undefined && !handlerTeams.has(t.team_id);

  return (
    <div>
      <div className="filters" role="group" aria-label={`Filters voor ${titel}`}>
        <Keuzelijst label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Alle teams</option>
          {zichtbareTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Keuzelijst>
        <Keuzelijst label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
          <option value="">Alle statussen</option>
          {STATUSSEN.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Keuzelijst>
        <Keuzelijst label="Prioriteit" value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as Prioriteit | '')}>
          <option value="">Alle prioriteiten</option>
          {PRIORITEITEN.map((p) => (
            <option key={p} value={p}>
              {PRIORITEIT_LABEL[p]}
            </option>
          ))}
        </Keuzelijst>
        <Keuzelijst
          label="Sorteren op"
          value={`${sorteer}:${oplopend ? 'op' : 'af'}`}
          onChange={(e) => {
            const [op, richting] = e.target.value.split(':');
            setSorteer(op as SorteerOp);
            setOplopend(richting === 'op');
          }}
        >
          <option value="created_at:af">Nieuwste eerst</option>
          <option value="created_at:op">Oudste eerst</option>
          <option value="updated_at:af">Laatst bijgewerkt</option>
          <option value="priority:af">Hoogste prioriteit</option>
          <option value="priority:op">Laagste prioriteit</option>
        </Keuzelijst>
      </div>

      <p className="muted klein" aria-live="polite" style={{ marginBottom: 'var(--space-3)' }}>
        {gefilterd.length === 1 ? '1 ticket' : `${gefilterd.length} tickets`}
      </p>

      <Kaart variant="vlak" aria-label={titel}>
        {gefilterd.length === 0 ? (
          <Leeg icoon={Inbox} titel="Geen tickets">
            {tickets.length === 0 ? legeTekst : 'Er zijn geen tickets die aan deze filters voldoen.'}
          </Leeg>
        ) : (
          <>
            <div className="tabel-wrap">
              <table className="tabel tabel--tickets">
                <caption className="sr-only">{titel}</caption>
                <thead>
                  <tr>
                    <th>Nummer</th>
                    <th>Onderwerp</th>
                    <th>Team</th>
                    {sorteerKop('priority', 'Prioriteit')}
                    <th>Status</th>
                    {sorteerKop('created_at', 'Ingediend')}
                    {toonBijgewerkt && sorteerKop('updated_at', 'Bijgewerkt')}
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link to={`/tickets/${encodeURIComponent(t.number)}`} className="ticketnummer">
                          {t.number}
                        </Link>
                      </td>
                      <td>
                        <div className="rij" style={{ gap: 'var(--space-2)' }}>
                          <Link to={`/tickets/${encodeURIComponent(t.number)}`}>{t.subject}</Link>
                          {t.confidential && <VertrouwelijkBadge />}
                          {alleenLezen(t) && <Badge variant="rand">Alleen lezen</Badge>}
                        </div>
                      </td>
                      <td>{teamNaam(teams, t.team_id)}</td>
                      <td>
                        <PrioriteitBadge prioriteit={t.priority} />
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="muted">
                        <time dateTime={t.created_at}>{datum(t.created_at)}</time>
                      </td>
                      {toonBijgewerkt && (
                        <td className="muted">
                          <time dateTime={t.updated_at}>{datumTijd(t.updated_at)}</time>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="ticketkaarten" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {gefilterd.map((t) => (
                <li key={t.id}>
                  <Link to={`/tickets/${encodeURIComponent(t.number)}`} className="ticketkaart">
                    <span className="rij rij--tussen">
                      <span className="ticketnummer">{t.number}</span>
                      <span className="muted klein">{datum(t.created_at)}</span>
                    </span>
                    <strong style={{ color: 'var(--agium-navy)' }}>{t.subject}</strong>
                    <span className="rij" style={{ gap: 'var(--space-2)' }}>
                      <span className="muted klein">{teamNaam(teams, t.team_id)}</span>
                      <StatusBadge status={t.status} />
                      <PrioriteitBadge prioriteit={t.priority} />
                      {t.confidential && <VertrouwelijkBadge />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Kaart>
    </div>
  );
}
