import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { teamRequest } from './team-client';
import type { TeamPresence } from './team-contract';

const COLOURS = ['#e5484d', '#3e63dd', '#30a46c', '#f76b15', '#8e4ec6', '#0d9488', '#d6409f', '#ca8a04'];

export function presenceColour(email: string): string {
  let hash = 0;
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The caret as a line ID and character offset, read from the editor's DOM. */
function caret(root: HTMLElement | null): { blockId?: string; offset?: number } {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  if (!root || !node || !root.contains(node)) return {};
  const line = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-block-id]');
  const blockId = line?.dataset.blockId;
  if (!line || !blockId) return {};
  const range = document.createRange();
  range.setStart(line, 0);
  range.setEnd(node, selection!.focusOffset);
  return { blockId, offset: range.toString().length };
}

/**
 * Heartbeat for the team workspace: reports where this person is and whether they are typing, and returns
 * everyone else in the project. Beats every second while others are here, every three when alone.
 */
export function usePresence(projectId: string, documentId: string | undefined, root: RefObject<HTMLElement | null>, setPace?: (ms: number) => void): TeamPresence[] {
  const [peers, setPeers] = useState<TeamPresence[]>([]);
  const typed = useRef(0);
  useEffect(() => {
    const onInput = () => { typed.current = Date.now(); };
    window.addEventListener('input', onInput, true);
    window.addEventListener('keydown', onInput, true);
    return () => { window.removeEventListener('input', onInput, true); window.removeEventListener('keydown', onInput, true); };
  }, []);
  useEffect(() => {
    let live = true;
    let timer = 0;
    let busy = false;
    let others = 0;
    const beat = async () => {
      if (!busy && document.visibilityState === 'visible') {
        busy = true;
        try {
          const list = await teamRequest<TeamPresence[]>('presence', { projectId, documentId, ...caret(root.current), typing: Date.now() - typed.current < 2500 });
          if (live) { setPeers(list); others = list.length; }
        } catch { /* presence is best effort; editing never waits on it */ }
        busy = false;
      }
      setPace?.(others ? 800 : 1750);
      if (live) timer = window.setTimeout(beat, others ? 1000 : 3000);
    };
    void beat();
    return () => { live = false; window.clearTimeout(timer); };
  }, [projectId, documentId, root, setPace]);
  return peers;
}

export function PresenceBar({ peers, documentTitle, onFollow }: { peers: TeamPresence[]; documentTitle: (id?: string) => string | undefined; onFollow: (peer: TeamPresence) => void }) {
  if (!peers.length) return <p className="presence-alone">Only you are here</p>;
  return <ul className="presence-bar" aria-label="People in this project">
    {peers.map(peer => {
      const where = documentTitle(peer.documentId);
      const label = `${peer.name} — ${peer.typing ? 'typing' : 'viewing'}${where ? ` in ${where}` : ''}`;
      return <li key={peer.email}>
        <button type="button" className={`presence-avatar${peer.typing ? ' is-typing' : ''}`} style={{ ['--peer' as string]: presenceColour(peer.email) }}
          title={`${label}. Select to jump to them.`} aria-label={`Jump to ${label}`} onClick={() => onFollow(peer)} disabled={!peer.blockId}>
          {initials(peer.name)}
        </button>
      </li>;
    })}
    <li className="presence-count">{peers.length + 1} here</li>
  </ul>;
}

/** Other people's carets drawn over the script, positioned from their line ID and character offset. */
export function RemoteCursors({ peers, documentId, root }: { peers: TeamPresence[]; documentId: string; root: RefObject<HTMLElement | null> }) {
  const [marks, setMarks] = useState<Array<{ peer: TeamPresence; top: number; left: number; height: number }>>([]);
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const host = root.current;
      if (!host) return;
      const box = host.getBoundingClientRect();
      const next: typeof marks = [];
      for (const peer of peers) {
        if (peer.documentId !== documentId || !peer.blockId) continue;
        const line = host.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(peer.blockId)}"]`);
        if (!line) continue;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let remaining = peer.offset ?? 0;
        let rect: DOMRect | undefined;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent?.length ?? 0;
          if (remaining <= length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
            break;
          }
          remaining -= length;
        }
        const fallback = line.getBoundingClientRect();
        const at = rect && rect.height ? rect : fallback;
        next.push({ peer, top: at.top - box.top + host.scrollTop, left: (rect && rect.height ? at.left : fallback.left) - box.left + host.scrollLeft, height: at.height || 18 });
      }
      setMarks(next);
    };
    place();
    const onMove = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [peers, documentId, root]);
  return <>{marks.map(({ peer, top, left, height }) => <span key={peer.email} className="remote-caret" aria-hidden="true"
    style={{ top, left, height, ['--peer' as string]: presenceColour(peer.email) }}><b>{peer.name}</b></span>)}</>;
}
