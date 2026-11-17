import { CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

type KnopVariant = 'primair' | 'secundair' | 'rand' | 'spook';

export function Knop({
  variant = 'primair',
  klein = false,
  icoon: Icoon,
  alleenIcoon = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: KnopVariant;
  klein?: boolean;
  icoon?: LucideIcon;
  alleenIcoon?: boolean;
}) {
  const cls = ['knop', `knop--${variant}`, klein && 'knop--sm', alleenIcoon && 'knop--icoon', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {Icoon && <Icoon size={klein ? 16 : 18} aria-hidden="true" />}
      {children}
    </button>
  );
}

interface VeldProps {
  label: string;
  hulp?: ReactNode;
  fout?: string | null;
  verplicht?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

export function Veld({ label, hulp, fout, verplicht, children }: VeldProps) {
  const id = useId();
  const hulpId = `${id}-hulp`;
  const foutId = `${id}-fout`;
  const beschreven = [hulp ? hulpId : null, fout ? foutId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="veld">
      <label className="veld__label" htmlFor={id}>
        {label}
        {verplicht && (
          <span className="veld__verplicht" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-describedby': beschreven, 'aria-invalid': fout ? true : undefined })}
      {hulp && (
        <span id={hulpId} className="veld__hulp">
          {hulp}
        </span>
      )}
      {fout && (
        <span id={foutId} className="veld__fout" role="alert">
          {fout}
        </span>
      )}
    </div>
  );
}

export function Invoer({
  label,
  hulp,
  fout,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hulp?: ReactNode; fout?: string | null }) {
  return (
    <Veld label={label} hulp={hulp} fout={fout} verplicht={rest.required}>
      {(p) => <input className="invoer" {...p} {...rest} />}
    </Veld>
  );
}

export function Tekstvak({
  label,
  hulp,
  fout,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hulp?: ReactNode; fout?: string | null }) {
  return (
    <Veld label={label} hulp={hulp} fout={fout} verplicht={rest.required}>
      {(p) => <textarea className="invoer" {...p} {...rest} />}
    </Veld>
  );
}

export function Keuzelijst({
  label,
  hulp,
  fout,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hulp?: ReactNode; fout?: string | null }) {
  return (
    <Veld label={label} hulp={hulp} fout={fout} verplicht={rest.required}>
      {(p) => (
        <select className="invoer" {...p} {...rest}>
          {children}
        </select>
      )}
    </Veld>
  );
}

export function Schakelaar({
  label,
  uitleg,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  uitleg?: ReactNode;
  checked: boolean;
  onChange: (waarde: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="schakelaar" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={uitleg ? `${id}-uitleg` : undefined}
      />
      <span className="schakelaar__baan" aria-hidden="true" />
      <span className="schakelaar__tekst">
        <strong>{label}</strong>
        {uitleg && (
          <span id={`${id}-uitleg`} className="muted klein">
            {uitleg}
          </span>
        )}
      </span>
    </label>
  );
}

type BadgeVariant = 'neutraal' | 'positief' | 'aandacht' | 'info' | 'solide' | 'rand';

export function Badge({ variant = 'neutraal', stip, children }: { variant?: BadgeVariant; stip?: boolean; children: ReactNode }) {
  return (
    <span className={`badge badge--${variant}`}>
      {stip && <span className="badge__stip" aria-hidden="true" />}
      {children}
    </span>
  );
}

const MELDING_ICOON: Record<'info' | 'positief' | 'aandacht', LucideIcon> = {
  info: Info,
  positief: CircleCheck,
  aandacht: TriangleAlert,
};

export function Melding({
  variant = 'info',
  titel,
  children,
  rol,
}: {
  variant?: 'info' | 'positief' | 'aandacht';
  titel?: string;
  children?: ReactNode;
  rol?: 'status' | 'alert';
}) {
  const Icoon = MELDING_ICOON[variant];
  const kleur = variant === 'positief' ? 'var(--agium-green-dark)' : variant === 'aandacht' ? 'var(--status-attention-fg)' : 'var(--agium-navy)';
  return (
    <div className={`melding melding--${variant}`} role={rol ?? (variant === 'aandacht' ? 'alert' : 'status')}>
      <Icoon size={20} color={kleur} aria-hidden="true" />
      <div className="melding__inhoud">
        {titel && <div className="melding__titel">{titel}</div>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Kaart({
  children,
  variant,
  className = '',
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode;
  variant?: 'zacht' | 'compact' | 'vlak';
  className?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
  'aria-labelledby'?: string;
  'aria-label'?: string;
}) {
  return (
    <Tag className={['kaart', variant && `kaart--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

export function Laden({ tekst = 'Laden...' }: { tekst?: string }) {
  return (
    <div className="laden" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {tekst}
    </div>
  );
}

export function Leeg({ icoon: Icoon, titel, children }: { icoon: LucideIcon; titel: string; children?: ReactNode }) {
  return (
    <div className="leeg">
      <span className="leeg__icoon" aria-hidden="true">
        <Icoon size={22} color="var(--agium-green-dark)" />
      </span>
      <h3>{titel}</h3>
      {children && <p className="muted klein">{children}</p>}
    </div>
  );
}

export function PaginaKop({ eyebrow, titel, children, actie }: { eyebrow?: string; titel: string; children?: ReactNode; actie?: ReactNode }) {
  return (
    <div className="pagina-kop">
      <div className="pagina-kop__tekst">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{titel}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      {actie}
    </div>
  );
}
