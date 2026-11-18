import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Lidmaatschap, Profiel, Team } from './types';
import { TEAM_KOLOMMEN } from './types';

// Let op: deze context bepaalt alleen wat de interface toont. De echte
// afscherming zit in RLS en in de Edge Functions.

export interface AuthState {
  laden: boolean;
  sessie: Session | null;
  profiel: Profiel | null;
  lidmaatschappen: Lidmaatschap[];
  teams: Team[];
  isItAdmin: boolean;
  /** Team-id's waarvan de gebruiker behandelaar (handler of admin) is. */
  handlerTeams: Set<string>;
  fout: string | null;
  herlaad: () => Promise<void>;
  uitloggen: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface Gegevens {
  profiel: Profiel | null;
  lidmaatschappen: Lidmaatschap[];
  teams: Team[];
  isItAdmin: boolean;
}

const LEEG: Gegevens = { profiel: null, lidmaatschappen: [], teams: [], isItAdmin: false };

async function laadGegevens(userId: string): Promise<Gegevens> {
  const profielRes = await supabase
    .from('profiles')
    .select('id, full_name, email, active, must_change_password, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (profielRes.error) throw new Error(profielRes.error.message);
  const profiel = profielRes.data as Profiel | null;
  if (!profiel || profiel.must_change_password) return { ...LEEG, profiel };

  const [leden, teams, admin] = await Promise.all([
    supabase.from('team_members').select('team_id, user_id, role').eq('user_id', userId),
    supabase.from('teams').select(TEAM_KOLOMMEN).order('name'),
    supabase.rpc('is_it_admin'),
  ]);
  if (leden.error) throw new Error(leden.error.message);
  if (teams.error) throw new Error(teams.error.message);
  return {
    profiel,
    lidmaatschappen: (leden.data ?? []) as Lidmaatschap[],
    teams: (teams.data ?? []) as Team[],
    isItAdmin: admin.data === true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<Session | null>(null);
  const [gegevens, setGegevens] = useState<Gegevens>(LEEG);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);

  // Gebruiker waarvan de gegevens nu geladen zijn. Bij een andere gebruiker (net
  // ingelogd) tonen we het laadscherm tot profiel en rechten er zijn, zodat er
  // niet kort "Geen toegang" verschijnt.
  const geladenVoor = useRef<string | null>(null);

  const verwerk = useCallback(async (s: Session | null) => {
    if (!s) {
      geladenVoor.current = null;
      setSessie(null);
      setGegevens(LEEG);
      setFout(null);
      setLaden(false);
      return;
    }
    if (geladenVoor.current !== s.user.id) setLaden(true);
    let nieuweGegevens: Gegevens = LEEG;
    let nieuweFout: string | null = null;
    try {
      nieuweGegevens = await laadGegevens(s.user.id);
    } catch (e) {
      nieuweFout = e instanceof Error ? e.message : 'Kon je gegevens niet laden';
    }
    // Sessie, gegevens en status in één keer bijwerken.
    geladenVoor.current = s.user.id;
    setSessie(s);
    setGegevens(nieuweGegevens);
    setFout(nieuweFout);
    setLaden(false);
  }, []);

  useEffect(() => {
    let actief = true;
    supabase.auth.getSession().then(({ data }) => {
      if (actief) void verwerk(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!actief) return;
      // Supabase raadt aan geen andere Supabase-aanroepen synchroon in deze callback te doen.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Laadscherm meteen tonen bij een nieuwe gebruiker; laden gebeurt net daarna.
        if (s && geladenVoor.current !== s.user.id) setLaden(true);
        setTimeout(() => void verwerk(s), 0);
      } else if (s && geladenVoor.current === s.user.id) {
        // Bijvoorbeeld TOKEN_REFRESHED: alleen het nieuwe token overnemen.
        setSessie(s);
      }
    });
    return () => {
      actief = false;
      sub.subscription.unsubscribe();
    };
  }, [verwerk]);

  const herlaad = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await verwerk(data.session);
  }, [verwerk]);

  const uitloggen = useCallback(async () => {
    await supabase.auth.signOut();
    setSessie(null);
    setGegevens(LEEG);
  }, []);

  const waarde = useMemo<AuthState>(
    () => ({
      laden,
      sessie,
      ...gegevens,
      handlerTeams: new Set(gegevens.lidmaatschappen.map((l) => l.team_id)),
      fout,
      herlaad,
      uitloggen,
    }),
    [laden, sessie, gegevens, fout, herlaad, uitloggen],
  );

  return <AuthContext.Provider value={waarde}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth buiten AuthProvider');
  return ctx;
}

export function teamNaam(teams: Team[], id: string): string {
  return teams.find((t) => t.id === id)?.name ?? 'Onbekend team';
}
