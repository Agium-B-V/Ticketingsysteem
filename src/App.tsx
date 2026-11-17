import { LogOut } from 'lucide-react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Kaart, Knop, Laden, Melding } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { AlleTicketsPagina } from './pages/AlleTicketsPagina';
import { BeheerPagina } from './pages/beheer/BeheerPagina';
import { DashboardPagina } from './pages/DashboardPagina';
import { InloggenPagina } from './pages/InloggenPagina';
import { MijnTicketsPagina } from './pages/MijnTicketsPagina';
import { NieuwTicketPagina } from './pages/NieuwTicketPagina';
import { TicketDetailPagina } from './pages/TicketDetailPagina';
import { WachtwoordPagina } from './pages/WachtwoordPagina';

// HashRouter: routing werkt zonder server-side fallback (GitHub Pages). Zie de
// README voor de overstap naar normale routing op Azure Static Web Apps.
export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="*" element={<Poort />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

function Poort() {
  const { laden, sessie, profiel, fout, uitloggen } = useAuth();

  if (laden) {
    return (
      <div className="loginpagina">
        <Laden />
      </div>
    );
  }

  if (!sessie) return <InloggenPagina />;

  if (fout || !profiel || !profiel.active) {
    return (
      <div className="loginpagina">
        <Kaart className="loginkaart">
          <div className="stapel">
            <Melding variant="aandacht" titel="Geen toegang">
              {fout
                ? 'Je gegevens konden niet worden geladen. Probeer het later opnieuw.'
                : 'Je account is niet (meer) actief. Neem contact op met IT als dit niet klopt.'}
            </Melding>
            <Knop variant="rand" icoon={LogOut} onClick={() => void uitloggen()}>
              Uitloggen
            </Knop>
          </div>
        </Kaart>
      </div>
    );
  }

  if (profiel.must_change_password) return <WachtwoordPagina />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<MijnTicketsPagina />} />
        <Route path="/nieuw" element={<NieuwTicketPagina />} />
        <Route path="/tickets" element={<AlleTicketsPagina />} />
        <Route path="/tickets/:nummer" element={<TicketDetailPagina />} />
        <Route path="/dashboard" element={<DashboardPagina />} />
        <Route path="/beheer/*" element={<BeheerPagina />} />
        <Route path="/wachtwoord" element={<WachtwoordPagina />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
