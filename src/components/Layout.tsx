import { KeyRound, LayoutDashboard, List, LogOut, Menu, Plus, Settings, Ticket, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Knop } from './ui';

const logo = `${import.meta.env.BASE_URL}agium-logo.png`;

function NavItem({ to, icoon: Icoon, children, eind }: { to: string; icoon: typeof Ticket; children: ReactNode; eind?: boolean }) {
  return (
    <NavLink to={to} end={eind} className={({ isActive }) => (isActive ? 'actief' : undefined)}>
      <Icoon size={16} aria-hidden="true" />
      {children}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { profiel, handlerTeams, isItAdmin, uitloggen } = useAuth();
  const [open, setOpen] = useState(false);
  const [vorigePad, setVorigePad] = useState('');
  const { pathname } = useLocation();
  // Menu sluiten na navigatie (mobiel)
  if (pathname !== vorigePad) {
    setVorigePad(pathname);
    if (open) setOpen(false);
  }

  return (
    <>
      {/* Geen href="#inhoud": met HashRouter zou dat een routewissel zijn. */}
      <button type="button" className="skip-link knop knop--secundair knop--sm" onClick={() => document.getElementById('inhoud')?.focus()}>
        Naar de inhoud
      </button>
      <header className={`header ${open ? 'header--open' : ''}`}>
        <div className="header__inner">
          <Link to="/" className="header__logo" aria-label="Agium Ticketing, naar Mijn tickets">
            <img src={logo} alt="Agium" />
            <span className="header__product">Ticketing</span>
          </Link>
          <Knop
            variant="spook"
            alleenIcoon
            className="menu-knop"
            icoon={open ? X : Menu}
            aria-expanded={open}
            aria-controls="hoofdmenu"
            aria-label={open ? 'Menu sluiten' : 'Menu openen'}
            onClick={() => setOpen((o) => !o)}
          />
          <nav className="nav" id="hoofdmenu" aria-label="Hoofdmenu">
            <NavItem to="/" icoon={Ticket} eind>
              Mijn tickets
            </NavItem>
            <NavItem to="/nieuw" icoon={Plus}>
              Nieuw ticket
            </NavItem>
            <NavItem to="/tickets" icoon={List} eind>
              Alle tickets
            </NavItem>
            {handlerTeams.size > 0 && (
              <NavItem to="/dashboard" icoon={LayoutDashboard}>
                Dashboard
              </NavItem>
            )}
            {isItAdmin && (
              <NavItem to="/beheer" icoon={Settings}>
                Beheer
              </NavItem>
            )}
          </nav>
          <div className="header__gebruiker">
            <span className="header__naam" title={profiel?.email}>
              {profiel?.full_name}
            </span>
            <Link to="/wachtwoord" className="knop knop--spook knop--sm" title="Wachtwoord wijzigen">
              <KeyRound size={16} aria-hidden="true" />
              <span className="sr-only">Wachtwoord wijzigen</span>
            </Link>
            <Knop variant="rand" klein icoon={LogOut} onClick={() => void uitloggen()}>
              Uitloggen
            </Knop>
          </div>
        </div>
      </header>
      <main id="inhoud" className="container" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
