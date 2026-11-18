import { useEffect, useRef } from 'react';

/** Keys shown with Astryx Kbd: "mod" is ⌘ on Apple platforms and Ctrl elsewhere. */
export interface Shortcut {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const GO_KEYS: { key: string; label: string; target: string }[] = [
  { key: 'h', label: 'Projects (home)', target: 'home' },
  { key: 'p', label: 'Project overview', target: 'project' },
  { key: 'w', label: 'Script', target: 'script' },
  { key: 'o', label: 'Outline', target: 'outline' },
  { key: 'i', label: 'Series Intelligence', target: 'story' },
  { key: 'e', label: 'Editorial', target: 'editorial' },
  { key: 'y', label: 'Creator studio', target: 'creator' },
  { key: 's', label: 'Production schedule', target: 'production-schedule' },
  { key: 'b', label: 'Breakdown', target: 'production-breakdown' },
  { key: 'v', label: 'Shots & storyboard', target: 'production-shots' },
  { key: 'd', label: 'Sides', target: 'production-sides' },
  { key: 'c', label: 'Call sheets', target: 'production-call-sheets' },
  { key: 'r', label: 'Reports', target: 'production-reports' },
  { key: 'f', label: 'Files & media', target: 'media' },
  { key: 'm', label: 'Import', target: 'import' },
  { key: 't', label: 'Team & sharing', target: 'team' }
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  { title: 'Everywhere', shortcuts: [
    { keys: ['mod+k'], label: 'Command palette: jump to a section, episode or scene' },
    { keys: ['?'], label: 'Show keyboard shortcuts' },
    { keys: ['mod+\\'], label: 'Show or hide the project sidebar' },
    { keys: ['alt+pageup', 'alt+pagedown'], label: 'Previous or next episode' },
    { keys: ['escape'], label: 'Close a menu, dialog or panel' }
  ] },
  { title: 'Go to (press g, then a letter)', shortcuts: GO_KEYS.map(item => ({ keys: [`g ${item.key}`], label: item.label })) },
  { title: 'Episodes (outside text fields)', shortcuts: [
    { keys: ['['], label: 'Previous episode' },
    { keys: [']'], label: 'Next episode' }
  ] },
  { title: 'Screenplay elements', shortcuts: [
    { keys: ['mod+alt+1'], label: 'Scene heading' },
    { keys: ['mod+alt+2'], label: 'Action' },
    { keys: ['mod+alt+3'], label: 'Character' },
    { keys: ['mod+alt+4'], label: 'Parenthetical' },
    { keys: ['mod+alt+5'], label: 'Dialogue' },
    { keys: ['mod+alt+6'], label: 'Transition' },
    { keys: ['mod+alt+7'], label: 'Shot' },
    { keys: ['mod+alt+8'], label: 'Note' },
    { keys: ['mod+alt+9'], label: 'Act' },
    { keys: ['tab', 'shift+tab'], label: 'Next or previous element in the screenplay cycle' },
    { keys: ['enter'], label: 'New paragraph with the expected next element' },
    { keys: ['mod+e'], label: 'Element menu' }
  ] },
  { title: 'Writing', shortcuts: [
    { keys: ['mod+f'], label: 'Find and replace' },
    { keys: ['mod+shift+f'], label: 'Focus mode (Esc to leave)' },
    { keys: ['mod+z'], label: 'Undo' },
    { keys: ['mod+shift+z'], label: 'Redo' }
  ] }
];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

export interface ShortcutHandlers {
  palette: () => void;
  help: () => void;
  sidebar: () => void;
  episode: (step: -1 | 1) => void;
  go: (target: string) => void;
}

/** Global navigation keys. They never use plain letters inside text fields or the manuscript. */
export function useGlobalShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    let pendingGo = 0;
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && !event.altKey && !event.shiftKey && key === 'k') {
        event.preventDefault();
        latest.current.palette();
        return;
      }
      if (mod && !event.altKey && (key === '\\' || event.code === 'Backslash')) {
        event.preventDefault();
        latest.current.sidebar();
        return;
      }
      if (event.altKey && !mod && (event.key === 'PageUp' || event.key === 'PageDown')) {
        event.preventDefault();
        latest.current.episode(event.key === 'PageUp' ? -1 : 1);
        return;
      }
      if (mod || event.altKey || isTypingTarget(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      if (pendingGo && Date.now() - pendingGo < 1200) {
        pendingGo = 0;
        const target = GO_KEYS.find(item => item.key === key);
        if (target) {
          event.preventDefault();
          latest.current.go(target.target);
        }
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        latest.current.help();
      } else if (key === 'g' && !event.shiftKey) {
        pendingGo = Date.now();
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        latest.current.episode(event.key === '[' ? -1 : 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
