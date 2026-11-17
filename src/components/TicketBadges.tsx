import { Lock } from 'lucide-react';
import { PRIORITEIT_LABEL, STATUS_LABEL } from '../lib/format';
import type { Prioriteit, Status } from '../lib/types';
import { Badge } from './ui';

const STATUS_VARIANT = {
  open: 'info',
  in_behandeling: 'solide',
  afgerond: 'positief',
  geannuleerd: 'rand',
} as const;

const PRIORITEIT_VARIANT = {
  laag: 'neutraal',
  midden: 'info',
  hoog: 'aandacht',
} as const;

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} stip>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PrioriteitBadge({ prioriteit }: { prioriteit: Prioriteit }) {
  return <Badge variant={PRIORITEIT_VARIANT[prioriteit]}>{PRIORITEIT_LABEL[prioriteit]}</Badge>;
}

export function VertrouwelijkBadge() {
  return (
    <Badge variant="aandacht">
      <Lock size={12} aria-hidden="true" />
      Vertrouwelijk
    </Badge>
  );
}
