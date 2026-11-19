import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Copy, Database, KeyRound, Link2, LogIn, Send, Sparkles, Square, TextCursorInput } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { decodeFountain } from '../interchange/screenplay';
import type { DocumentModel, Project, WorkspaceViewProps } from '../model';
import { KEY_PROVIDERS, loadKeys, saveKeys, startOpenRouter } from './byok';
import type { KeyProvider, Keys } from './byok';
import { aiContext } from './context';
import { parseBeats } from './beats';
import { trainingExamples, trainingJsonl } from './dataset';
import './ai.css';

type Mode = 'brainstorm' | 'outline' | 'characters' | 'plot' | 'continue' | 'dialogue' | 'notes' | 'logline' | 'creator' | 'ask';
type Group = 'plan' | 'write';
interface Model { id: string; label: string; provider: string; free: boolean }
interface Turn { role: 'user' | 'assistant'; content: string }

/** Planning helps shape the story; writing works on the pages. */
const MODES: Array<{ id: Mode; group: Group; label: string; hint: string; writes?: boolean; outline?: boolean }> = [
  { id: 'outline', group: 'plan', label: 'Build outline', hint: 'Beats across three acts, ready to add to your Outline.', outline: true },
  { id: 'brainstorm', group: 'plan', label: 'Story ideas', hint: 'Six options for what could happen next, from safe to bold.' },
  { id: 'characters', group: 'plan', label: 'Characters', hint: 'Wants, needs, flaws and arcs for your main characters.' },
  { id: 'plot', group: 'plan', label: 'Fix structure', hint: 'What is sagging or missing, and beats to fix it.' },
  { id: 'logline', group: 'plan', label: 'Loglines', hint: 'Five loglines in different tones.' },
  { id: 'creator', group: 'plan', label: 'Hooks & titles', hint: 'Hooks, titles and tighter beats for a short or YouTube video.' },
  { id: 'continue', group: 'write', label: 'Continue scene', hint: 'Drafts the next half page of this scene in your voice.', writes: true },
  { id: 'dialogue', group: 'write', label: 'Polish dialogue', hint: 'Sharper, more distinct voices with more subtext — select lines first to focus it.', writes: true },
  { id: 'notes', group: 'write', label: 'Scene notes', hint: 'Development notes on the scene you are in, with specific fixes.' },
  { id: 'ask', group: 'write', label: 'Ask anything', hint: 'Ask a question about your story or script.' }
];

const MODEL_KEY = 'swdr-ai-model';

function editorCaret(): { blockId?: string; selection?: string } {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  const line = node && (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('.swdr-pm [data-block-id]');
  return { blockId: line?.dataset.blockId, selection: selection && !selection.isCollapsed ? selection.toString() : undefined };
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/jsonl' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The AI writing partner: a toolbar button that opens a streaming, project-aware assistant. */
export function AiPartner({ project, document, onDocumentChange, onStatus, readOnly, mode: initial = 'brainstorm', extraContext, label = 'AI partner' }: {
  project: Project; document?: DocumentModel; onDocumentChange?: WorkspaceViewProps['onDocumentChange']; onStatus: (message: string) => void;
  readOnly?: boolean; mode?: Mode; extraContext?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const caret = useRef<{ blockId?: string; selection?: string }>({});
  return <>
    <button type="button" className="swdr-w-button ai-trigger" onMouseDown={() => { caret.current = editorCaret(); }} onClick={() => setOpen(true)}>
      <Sparkles size={15} aria-hidden="true" /> {label}
    </button>
    {open && <AiDialog project={project} document={document} onDocumentChange={readOnly ? undefined : onDocumentChange} onStatus={onStatus}
      initial={initial} caret={caret.current} extraContext={extraContext} onClose={() => setOpen(false)} />}
  </>;
}

function AiDialog({ project, document, onDocumentChange, onStatus, initial, caret, extraContext, onClose }: {
  project: Project; document?: DocumentModel; onDocumentChange?: WorkspaceViewProps['onDocumentChange']; onStatus: (message: string) => void;
  initial: Mode; caret: { blockId?: string; selection?: string }; extraContext?: string; onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initial);
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  const [problem, setProblem] = useState<{ status: number; message: string }>();
  const [models, setModels] = useState<Model[]>();
  const [model, setModel] = useState(() => { try { return localStorage.getItem(MODEL_KEY) ?? ''; } catch { return ''; } });
  const [keys, setKeys] = useState<Keys>(loadKeys);
  const [accounts, setAccounts] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const spec = MODES.find(item => item.id === mode)!;

  useEffect(() => {
    let live = true;
    void fetch('/api/team', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ai-models', keys }) })
      .then(async response => {
        const body = await response.json().catch(() => ({})) as { data?: { models: Model[]; defaultModel?: string }; error?: string };
        if (!live) return;
        if (!response.ok) { setProblem({ status: response.status, message: body.error ?? 'The AI partner is unavailable.' }); setModels([]); return; }
        setModels(body.data?.models ?? []);
        // Keep the writer's choice, unless they have just connected their own account, which then takes over.
        const list = body.data?.models ?? [];
        const own = list.some(item => item.id.startsWith('mine-'));
        setModel(current => list.some(item => item.id === current) && (!own || current.startsWith('mine-')) ? current : body.data?.defaultModel ?? '');
        if (!body.data?.models.length) { setAccounts(true); setProblem({ status: 503, message: 'No AI model is connected yet. Connect your own account below, or ask the workspace owner to add a provider.' }); }
      })
      .catch(() => { if (live) { setModels([]); setProblem({ status: 0, message: 'The AI partner needs a connection.' }); } });
    return () => { live = false; abort.current?.abort(); };
  }, [keys]);

  useEffect(() => {
    if (!busy) return;
    setWaited(0);
    const started = Date.now();
    const tick = setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [busy]);

  async function run(followUp?: string) {
    const ask = followUp ?? prompt;
    if (mode === 'ask' && !ask.trim()) return;
    setBusy(true);
    setProblem(undefined);
    const previous = followUp ? [...history, { role: 'assistant' as const, content: output }] : [];
    const turns: Turn[] = followUp ? [...previous] : [];
    setOutput('');
    abort.current = new AbortController();
    let text = '';
    try {
      const response = await fetch('/api/team', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify({ action: 'ai', keys, model: model || undefined, mode: followUp ? 'ask' : mode, prompt: ask, history: turns,
          context: aiContext(project, document, { ...caret, extra: extraContext }) })
      });
      if (!response.ok || !response.body || response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setProblem({ status: response.status, message: body.error ?? (response.status === 504 || response.status === 408
          ? 'The model took too long to answer. Try again, or pick a faster model (Flash-Lite, or a free OpenRouter model).'
          : 'The AI partner could not answer. Try again, or pick another model.') });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setOutput(text);
      }
      setHistory([...turns, { role: 'user', content: followUp ? ask : `${spec.label}${ask ? `: ${ask}` : ''}` }]);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setProblem({ status: 0, message: 'The connection dropped. Try again.' });
    } finally {
      setBusy(false);
      if (followUp !== undefined) setPrompt('');
    }
  }

  function insert() {
    if (!onDocumentChange || !document) return;
    const blocks = decodeFountain(output.replace(/```\w*/g, ''), 'AI draft').document.blocks.filter(block => block.text.trim())
      .map(block => ({ ...block, sceneNumber: undefined }));
    if (!blocks.length) return;
    onDocumentChange(current => {
      const at = caret.blockId ? current.blocks.findIndex(block => block.id === caret.blockId) : -1;
      const index = at >= 0 ? at + 1 : current.blocks.length;
      return { ...current, blocks: [...current.blocks.slice(0, index), ...blocks, ...current.blocks.slice(index)] };
    });
    onStatus(`${blocks.length} lines from the AI partner inserted. Undo with Ctrl/⌘+Z.`);
    onClose();
  }

  function addBeats() {
    if (!onDocumentChange || !document) return;
    const beats = parseBeats(output).map(beat => ({ id: crypto.randomUUID(), ...beat }));
    onDocumentChange(current => ({ ...current, beats: [...current.beats, ...beats] }));
    onStatus(`${beats.length} beats added to the outline.`);
    onClose();
  }

  const examples = trainingExamples([project]).length;
  return <Dialog isOpen onOpenChange={value => { if (!value) onClose(); }} width={820}>
    <Layout
      header={<DialogHeader title="AI partner" subtitle={`Works from ${project.title}'s outline, characters and the scene you are in.`} onOpenChange={value => { if (!value) onClose(); }} />}
      content={<LayoutContent>
        <div className="ai">
          <div className="ai-top">
            <div className="ai-groups" role="tablist" aria-label="Plan or write">
              {(['plan', 'write'] as const).map(group => <button key={group} type="button" role="tab" aria-selected={spec.group === group}
                onClick={() => setMode(MODES.find(item => item.group === group)!.id)}>{group === 'plan' ? 'Plan the story' : 'Write the script'}</button>)}
            </div>
            {models && models.length > 1 && <label className="ai-model">Model
              <select value={model} onChange={event => { setModel(event.target.value); try { localStorage.setItem(MODEL_KEY, event.target.value); } catch { /* optional */ } }}>
                {[...new Set(models.map(item => item.provider))].map(provider => <optgroup key={provider} label={provider}>
                  {models.filter(item => item.provider === provider).map(item => <option key={item.id} value={item.id}>{item.label}{item.free ? ' · free' : ''}</option>)}
                </optgroup>)}
              </select></label>}
          </div>
          <div className="ai-modes" role="group" aria-label="What do you want help with">
            {MODES.filter(item => item.group === spec.group).map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>)}
          </div>
          <p className="ai-hint">{spec.hint}{caret.selection ? ' Using your selected text.' : ''}</p>
          <form className="ai-ask" onSubmit={event => { event.preventDefault(); void run(); }}>
            <textarea rows={2} value={prompt} onChange={event => setPrompt(event.target.value)} aria-label="Direction for the AI partner"
              placeholder={mode === 'ask' ? 'Ask about your story…' : 'Tell it what you need (optional) — “a twist for act two”, “Nora should lie here”, “funnier”…'}
              onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run(); } }} />
            {busy ? <Button label="Stop" variant="secondary" icon={<Square size={14} aria-hidden="true" />} onClick={() => abort.current?.abort()} />
              : <Button label="Generate" variant="primary" type="submit" icon={<Sparkles size={14} aria-hidden="true" />} isDisabled={models !== undefined && !models.length} />}
          </form>
          {problem && <div className="ai-problem" role="alert">
            <span>{problem.status === 401 ? 'Sign in to use the AI partner. It runs on the hosted workspace so your keys stay on the server.' : problem.message}</span>
            {problem.status === 401 && <Button label="Sign in" size="sm" variant="secondary" icon={<LogIn size={14} aria-hidden="true" />} onClick={() => { window.location.hash = '#team'; }} />}
          </div>}
          {(output || busy) && <section className="ai-output" aria-label="AI partner response" aria-busy={busy}>
            <pre className={spec.writes ? 'is-script' : undefined}>{output || `Thinking…${waited >= 3 ? ` ${waited}s` : ''}${waited >= 20 ? ' — thinking models can take a while before they write' : ''}`}</pre>
            {!busy && output && <div className="ai-actions">
              <Button label="Copy" size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true" />} onClick={() => { void navigator.clipboard?.writeText(output); onStatus('Copied.'); }} />
              {spec.outline && onDocumentChange && document && parseBeats(output).length > 0 && <Button label={`Add ${parseBeats(output).length} beats to outline`} size="sm" variant="primary" icon={<TextCursorInput size={14} aria-hidden="true" />} onClick={addBeats} />}
              {spec.writes && onDocumentChange && document?.kind !== 'av' && <Button label="Insert into script" size="sm" variant="primary" icon={<TextCursorInput size={14} aria-hidden="true" />} onClick={insert} />}
              <Button label="Try again" size="sm" variant="ghost" onClick={() => void run()} />
            </div>}
            {!busy && output && <form className="ai-ask ai-follow" onSubmit={event => { event.preventDefault(); const ask = new FormData(event.currentTarget).get('follow'); if (ask) void run(String(ask)); event.currentTarget.reset(); }}>
              <input name="follow" aria-label="Follow-up" placeholder="Follow up — “make option 3 funnier”, “what if she already knows?”" />
              <Button label="Send" size="sm" variant="secondary" type="submit" icon={<Send size={14} aria-hidden="true" />} />
            </form>}
          </section>}
          <details className="ai-accounts" open={accounts} onToggle={event => setAccounts(event.currentTarget.open)}>
            <summary><KeyRound size={14} aria-hidden="true" /> Your AI accounts{Object.keys(keys).length ? ` (${Object.keys(keys).length} connected)` : ''}</summary>
            <p>Use your own provider account, so requests are billed to you, not the workspace. Keys stay in this browser and are only sent with your AI requests; SWDR never stores them. Consumer plans such as Claude Pro or ChatGPT Plus cannot be used by other apps, so these need an API key.</p>
            <Button label={keys.openrouter ? 'OpenRouter connected' : 'Connect OpenRouter'} size="sm" variant={keys.openrouter ? 'secondary' : 'primary'} icon={<Link2 size={14} aria-hidden="true" />}
              isDisabled={!!keys.openrouter} onClick={() => void startOpenRouter()} />
            <ul>{KEY_PROVIDERS.map(item => <li key={item.id}>
              <label>{item.label}<input type="password" autoComplete="off" spellCheck={false} placeholder={item.hint} defaultValue={keys[item.id] ?? ''}
                aria-label={`${item.label} API key`} onBlur={event => {
                  const value = event.target.value.trim();
                  if ((keys[item.id] ?? '') === value) return;
                  const next = { ...keys };
                  if (value) next[item.id as KeyProvider] = value; else delete next[item.id as KeyProvider];
                  saveKeys(next); setKeys(next); setModels(undefined);
                  onStatus(value ? `${item.label} key saved in this browser.` : `${item.label} key removed.`);
                }} /></label>
              <small>{item.where}</small>
            </li>)}</ul>
          </details>
          <footer className="ai-foot">
            <span>The AI partner reads this project to help; nothing is saved on the AI provider by SWDR. Suggestions are yours to keep, change or ignore.</span>
            <button type="button" className="ai-dataset" disabled={!examples} onClick={() => { download(`${project.title || 'swdr'} - training data.jsonl`, trainingJsonl([project])); onStatus(`${examples} training examples exported.`); }}
              title="Your scenes as fine-tuning examples, for training an open model on your voice">
              <Database size={14} aria-hidden="true" /> Export training data ({examples})</button>
          </footer>
        </div>
      </LayoutContent>}
    />
  </Dialog>;
}
