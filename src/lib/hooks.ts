import { useCallback, useEffect, useRef, useState } from 'react';
import { foutTekst } from './format';
import { supabase } from './supabase';

export interface DataState<T> {
  data: T | undefined;
  fout: string | null;
  laden: boolean;
  herlaad: () => void;
}

/** Laadt data asynchroon met laad- en foutstatus. `sleutel` bepaalt wanneer opnieuw wordt geladen. */
export function useData<T>(laad: () => Promise<T>, sleutel: string): DataState<T> {
  const [state, setState] = useState<{ data: T | undefined; fout: string | null; sleutel: string | null }>({
    data: undefined,
    fout: null,
    sleutel: null,
  });
  const [versie, setVersie] = useState(0);
  const laadRef = useRef(laad);
  useEffect(() => {
    laadRef.current = laad;
  });

  useEffect(() => {
    let actief = true;
    laadRef.current().then(
      (data) => actief && setState({ data, fout: null, sleutel }),
      (err) => actief && setState((s) => ({ data: s.sleutel === sleutel ? s.data : undefined, fout: foutTekst(err), sleutel })),
    );
    return () => {
      actief = false;
    };
  }, [sleutel, versie]);

  const herlaad = useCallback(() => setVersie((v) => v + 1), []);
  // Laden = nog geen resultaat voor deze sleutel. Bij herladen blijft de oude data zichtbaar.
  const laden = state.sleutel !== sleutel;
  return { data: laden ? undefined : state.data, fout: laden ? null : state.fout, laden, herlaad };
}

/**
 * Roept `bijWijziging` aan als er tickets veranderen (Supabase Realtime).
 * Realtime respecteert RLS: je krijgt alleen wijzigingen van tickets die je mag zien.
 */
export function useTicketUpdates(bijWijziging: () => void) {
  const ref = useRef(bijWijziging);
  useEffect(() => {
    ref.current = bijWijziging;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kanaal = supabase
      .channel(`tickets-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => ref.current(), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(kanaal);
    };
  }, []);
}
