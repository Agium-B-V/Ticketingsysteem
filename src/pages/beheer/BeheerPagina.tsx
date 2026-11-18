import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { PaginaKop } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { BeheerGebruikers } from './BeheerGebruikers';
import { BeheerTeams } from './BeheerTeams';

// Alleen een UI-keuze: de database en de Edge Functions weigeren beheeracties
// van iedereen die geen IT-admin is, ook als iemand deze pagina toch opent.
export function BeheerPagina() {
  const { isItAdmin } = useAuth();
  if (!isItAdmin) return <Navigate to="/" replace />;

  return (
    <>
      <PaginaKop eyebrow="Beheer" titel="Gebruikers en teams">
        Alleen zichtbaar voor IT-admins.
      </PaginaKop>
      <nav className="tabs" aria-label="Beheer">
        <NavLink to="/beheer/gebruikers" className={({ isActive }) => (isActive ? 'actief' : undefined)}>
          Gebruikers
        </NavLink>
        <NavLink to="/beheer/teams" className={({ isActive }) => (isActive ? 'actief' : undefined)}>
          Teams
        </NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="gebruikers" replace />} />
        <Route path="gebruikers" element={<BeheerGebruikers />} />
        <Route path="teams" element={<BeheerTeams />} />
        <Route path="*" element={<Navigate to="gebruikers" replace />} />
      </Routes>
    </>
  );
}
