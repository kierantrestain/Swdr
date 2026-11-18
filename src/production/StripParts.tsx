import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Person, StripTone } from './model';

export const TONE_LABELS: Record<StripTone, string> = {
  'int-day': 'INT · Day', 'ext-day': 'EXT · Day', 'int-night': 'INT · Night', 'ext-night': 'EXT · Night'
};

/** Colour key shared by the strip and table views. */
export function StripLegend() {
  return <ul className="production-legend" aria-label="Strip colours">
    {(Object.keys(TONE_LABELS) as StripTone[]).map(tone => <li key={tone}>
      <span className={`production-swatch production-tone-${tone}`} aria-hidden="true" />{TONE_LABELS[tone]}
    </li>)}
  </ul>;
}

/** Cast ID chips, as on a stripboard. Names stay available to assistive technology and on hover. */
export function CastIds({ cast, ids }: { cast: Person[]; ids: Map<string, number> }) {
  if (!cast.length) return <span className="production-muted">—</span>;
  return <span className="production-cast-ids" title={cast.map(person => `${ids.get(person.id) ?? '?'} ${person.name}`).join(', ')}>
    {cast.map(person => <span key={person.id} className="production-cast-id" aria-hidden="true">{ids.get(person.id) ?? '?'}</span>)}
    <span className="production-visually-hidden">Cast {cast.map(person => `${ids.get(person.id) ?? ''} ${person.name}`).join(', ')}</span>
  </span>;
}

export interface MenuAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** A small disclosure menu with arrow-key navigation for keyboard scheduling. */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return <div className="production-menu" ref={root} onKeyDown={open ? navigate : undefined}>
    <button ref={trigger} type="button" className="production-icon production-menu-trigger" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
      <MoreHorizontal size={17} aria-hidden="true" />
    </button>
    {open && <div id={menuId} role="menu" aria-label={label} className="production-menu-list">
      {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} onClick={() => {
        setOpen(false);
        trigger.current?.focus();
        action.onSelect();
      }}>{action.label}</button>)}
    </div>}
  </div>;
}
