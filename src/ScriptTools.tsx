import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { AlertTriangle, BookOpenCheck, CheckCircle2, CircleAlert, Download, Play, Square, Target } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sceneList, sourceFor } from './model';
import type { DocumentModel, Project, WorkspaceViewProps } from './model';
import { castVoices, formatIssues, scriptReport, tableReadLines, words } from './writing/script-insights';
import type { ReadOptions } from './writing/script-insights';

type ToolProps = Pick<WorkspaceViewProps, 'project' | 'document' | 'onOpenSource' | 'onStatus'>;
type ToolTab = 'report' | 'checks' | 'read' | 'goals';

/* ---------- Writing goals (per viewer, per project; WriterDuet and Arc Studio benchmark) ---------- */

interface GoalState { daily: number; days: Record<string, { start: number; end: number }> }

const today = () => new Date().toISOString().slice(0, 10);
const goalKey = (project: Project) => `swdr-goal:${project.id}`;

function readGoal(project: Project): GoalState {
  try {
    const raw = JSON.parse(localStorage.getItem(goalKey(project)) ?? 'null') as GoalState | null;
    if (raw && typeof raw.daily === 'number' && raw.days) return raw;
  } catch { /* storage unavailable */ }
  return { daily: 0, days: {} };
}

function writeGoal(project: Project, goal: GoalState) {
  try { localStorage.setItem(goalKey(project), JSON.stringify(goal)); } catch { /* storage unavailable */ }
}

function projectWords(project: Project, document: DocumentModel): number {
  return project.documents.reduce((sum, item) => sum + (item.id === document.id ? document : item).blocks
    .reduce((total, block) => total + (block.kind === 'note' ? 0 : words(block.text)), 0), 0);
}

function written(day?: { start: number; end: number }) {
  return day ? Math.max(0, day.end - day.start) : 0;
}

function streak(goal: GoalState): number {
  if (!goal.daily) return 0;
  let count = 0;
  const cursor = new Date(`${today()}T12:00:00Z`);
  if (written(goal.days[today()]) < goal.daily) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (written(goal.days[cursor.toISOString().slice(0, 10)]) >= goal.daily) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

/** Keeps today's word tally current, counting once typing pauses so it never competes with keystrokes. */
function useGoal(project: Project, document: DocumentModel) {
  const [total, setTotal] = useState(() => projectWords(project, document));
  const [goal, setGoal] = useState(() => readGoal(project));
  useEffect(() => {
    const timer = window.setTimeout(() => setTotal(projectWords(project, document)), 1500);
    return () => window.clearTimeout(timer);
  }, [project, document]);
  useEffect(() => {
    setGoal(current => {
      const day = current.days[today()];
      const next = { ...current, days: { ...current.days, [today()]: { start: day?.start ?? total, end: total } } };
      writeGoal(project, next);
      return next;
    });
  }, [project, total]);
  const setDaily = (daily: number) => setGoal(current => { const next = { ...current, daily }; writeGoal(project, next); return next; });
  return { goal, total, setDaily };
}

export function ScriptTools(props: ToolProps) {
  const [open, setOpen] = useState(false);
  const { goal, total, setDaily } = useGoal(props.project, props.document);
  const done = written(goal.days[today()]);
  return <>
    <button type="button" className="swdr-w-button script-tools-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <BookOpenCheck size={15} aria-hidden="true" /> Script tools
      {goal.daily > 0 && <span className={`script-tools-goal${done >= goal.daily ? ' is-met' : ''}`} title="Words written today against your daily goal">
        {done.toLocaleString()}/{goal.daily.toLocaleString()}</span>}
    </button>
    {open && <ScriptToolsDialog {...props} goal={goal} total={total} setDaily={setDaily} onClose={() => setOpen(false)} />}
  </>;
}

function ScriptToolsDialog({ project, document, onOpenSource, onStatus, goal, total, setDaily, onClose }: ToolProps & {
  goal: GoalState; total: number; setDaily: (daily: number) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<ToolTab>('report');
  const report = useMemo(() => scriptReport(document), [document]);
  const issues = useMemo(() => formatIssues(document), [document]);
  const go = (blockId: string) => { onClose(); onOpenSource(sourceFor(project, document, { blockId })); };
  const errors = issues.filter(issue => issue.severity === 'error').length;

  return <Dialog isOpen onOpenChange={value => { if (!value) onClose(); }} width={820}>
    <Layout
      header={<DialogHeader title="Script tools" subtitle={`${document.title} · ${report.pages} ${report.pages === 1 ? 'page' : 'pages'} · ${report.scenes} scenes`} onOpenChange={value => { if (!value) onClose(); }} />}
      content={<LayoutContent>
        <div className="script-tools-body">
          <TabList value={tab} onChange={value => setTab(value as ToolTab)} hasDivider role="tablist">
            <Tab value="report" label="Report" />
            <Tab value="checks" label={issues.length ? `Checks (${issues.length})` : 'Checks'} />
            <Tab value="read" label="Table read" />
            <Tab value="goals" label="Goals" />
          </TabList>
          {tab === 'report' && <ReportTab report={report} title={document.title} />}
          {tab === 'checks' && <ChecksTab issues={issues} errors={errors} go={go} />}
          {tab === 'read' && <ReadTab document={document} report={report} onStatus={onStatus} />}
          {tab === 'goals' && <GoalsTab goal={goal} total={total} setDaily={setDaily} />}
        </div>
      </LayoutContent>}
    />
  </Dialog>;
}

/* ---------- Report (Final Draft reports, WriterDuet stats) ---------- */

function percent(part: number, whole: number) {
  return whole ? `${Math.round(part / whole * 100)}%` : '—';
}

function download(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportTab({ report, title }: { report: ReturnType<typeof scriptReport>; title: string }) {
  const settingTotal = report.scenes || 1;
  return <section className="script-tools-section" aria-label="Script report">
    <dl className="script-tools-metrics">
      <div><dt>Pages</dt><dd>{report.pages}</dd></div>
      <div><dt>Screen time</dt><dd>~{report.minutes} min</dd></div>
      <div><dt>Scenes</dt><dd>{report.scenes}</dd></div>
      <div><dt>Words</dt><dd>{report.words.toLocaleString()}</dd></div>
      <div><dt>Dialogue</dt><dd>{percent(report.dialogueWords, report.dialogueWords + report.actionWords)}</dd></div>
    </dl>
    <div className="script-tools-split" aria-label="Scene settings">
      {(['INT', 'EXT', 'INT/EXT'] as const).filter(key => report.settings[key]).map(key =>
        <span key={key}><strong>{report.settings[key]}</strong> {key} <small>{percent(report.settings[key], settingTotal)}</small></span>)}
      {report.times.slice(0, 4).map(time => <span key={time.name}><strong>{time.scenes}</strong> {time.name}</span>)}
    </div>

    <header className="script-tools-row">
      <h3>Characters</h3>
      {report.characters.length > 0 && <button type="button" className="swdr-w-button" onClick={() => download(`${title || 'script'} - characters.csv`, [
        ['Character', 'Speeches', 'Words', 'Share of dialogue', 'Scenes', 'First scene'],
        ...report.characters.map(item => [item.name, item.speeches, item.words, percent(item.words, report.dialogueWords), item.scenes, item.firstScene])
      ])}><Download size={14} aria-hidden="true" /> Export CSV</button>}
    </header>
    {report.characters.length ? <Table dividers="rows">
      <TableHeader><TableRow isHeaderRow>
        <TableHeaderCell>Character</TableHeaderCell><TableHeaderCell>Speeches</TableHeaderCell><TableHeaderCell>Words</TableHeaderCell>
        <TableHeaderCell>Share of dialogue</TableHeaderCell><TableHeaderCell>Scenes</TableHeaderCell><TableHeaderCell>First scene</TableHeaderCell>
      </TableRow></TableHeader>
      <TableBody>{report.characters.slice(0, 25).map(item => <TableRow key={item.name}>
        <TableCell><strong>{item.name}</strong></TableCell>
        <TableCell>{item.speeches}</TableCell>
        <TableCell>{item.words.toLocaleString()}</TableCell>
        <TableCell><span className="script-tools-bar"><span style={{ width: percent(item.words, report.dialogueWords) }} /></span> {percent(item.words, report.dialogueWords)}</TableCell>
        <TableCell>{item.scenes}</TableCell>
        <TableCell>{item.firstScene}</TableCell>
      </TableRow>)}</TableBody>
    </Table> : <p className="script-tools-muted">No character cues yet.</p>}

    <div className="script-tools-columns">
      <section aria-label="Locations">
        <h3>Locations</h3>
        {report.locations.length ? <ol className="script-tools-list">{report.locations.slice(0, 10).map(item =>
          <li key={item.name}><span>{item.name}</span><small>{item.scenes} {item.scenes === 1 ? 'scene' : 'scenes'}</small></li>)}</ol> :
          <p className="script-tools-muted">No scene headings yet.</p>}
      </section>
      <section aria-label="Longest scenes">
        <h3>Longest scenes</h3>
        {report.longestScenes.length ? <ol className="script-tools-list">{report.longestScenes.map(item =>
          <li key={`${item.number}-${item.heading}`}><span>{item.number}. {item.heading}</span><small>{item.words} words</small></li>)}</ol> :
          <p className="script-tools-muted">No scenes yet.</p>}
      </section>
    </div>
  </section>;
}

/* ---------- Formatting checks (WriterDuet formatting checker) ---------- */

function ChecksTab({ issues, errors, go }: { issues: ReturnType<typeof formatIssues>; errors: number; go: (blockId: string) => void }) {
  if (!issues.length) return <section className="script-tools-section script-tools-clear" aria-label="Formatting checks">
    <CheckCircle2 size={28} aria-hidden="true" />
    <h3>Formatting looks clean</h3>
    <p className="script-tools-muted">Scene headings, cues, dialogue, parentheticals, transitions and scene numbers all pass.</p>
  </section>;
  return <section className="script-tools-section" aria-label="Formatting checks">
    <p className="script-tools-muted">{errors} {errors === 1 ? 'problem' : 'problems'} and {issues.length - errors} {issues.length - errors === 1 ? 'suggestion' : 'suggestions'}. Choose one to jump to it in the script.</p>
    <ul className="script-tools-issues">{issues.slice(0, 80).map((issue, index) => <li key={`${issue.blockId}-${index}`}>
      <button type="button" onClick={() => go(issue.blockId)}>
        {issue.severity === 'error' ? <CircleAlert size={16} aria-hidden="true" className="is-error" /> : <AlertTriangle size={16} aria-hidden="true" className="is-warning" />}
        <span>{issue.message}</span>
        <Badge variant={issue.severity === 'error' ? 'error' : 'warning'} label={issue.severity === 'error' ? 'Fix' : 'Check'} />
      </button>
    </li>)}</ul>
  </section>;
}

/* ---------- Table read with a voice per character (Celtx Read Through) ---------- */

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const speech = window.speechSynthesis;
    if (!speech) return;
    const load = () => setVoices(speech.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('en')).concat(
      speech.getVoices().filter(voice => !voice.lang.toLowerCase().startsWith('en'))));
    load();
    speech.addEventListener?.('voiceschanged', load);
    return () => speech.removeEventListener?.('voiceschanged', load);
  }, []);
  return voices;
}

function ReadTab({ document, report, onStatus }: { document: DocumentModel; report: ReturnType<typeof scriptReport>; onStatus: (message: string) => void }) {
  const voices = useVoices();
  const names = voices.map(voice => voice.name);
  const cast = report.characters.map(item => item.name);
  const [narrator, setNarrator] = useState('');
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<ReadOptions>({ headings: true, action: true, cues: false, parentheticals: false });
  const [rate, setRate] = useState('1');
  const [from, setFrom] = useState('');
  const [now, setNow] = useState<{ index: number; total: number; who: string; text: string }>();
  const active = useRef(false);
  const scenes = sceneList(document);

  const narratorVoice = narrator || names[0] || '';
  const auto = useMemo(() => castVoices(cast, names, narratorVoice), [cast.join('|'), names.join('|'), narratorVoice]);
  const voiceFor = (name?: string) => name ? assigned[name] || auto[name] || narratorVoice : narratorVoice;

  useEffect(() => () => { if (active.current) { active.current = false; window.speechSynthesis?.cancel(); } }, []);

  function stop() {
    active.current = false;
    window.speechSynthesis?.cancel();
    setNow(undefined);
  }

  function start() {
    const speech = window.speechSynthesis;
    if (!speech || !voices.length) { onStatus('This browser has no reading voices. Try Chrome, Edge or Safari.'); return; }
    const lines = tableReadLines(document, { ...options, fromBlockId: from || undefined });
    if (!lines.length) { onStatus('Nothing to read with these settings.'); return; }
    active.current = true;
    const byName = new Map(voices.map(voice => [voice.name, voice]));
    const advance = (index: number) => {
      if (!active.current) return;
      const line = lines[index];
      if (!line) { stop(); onStatus('Table read finished.'); return; }
      setNow({ index, total: lines.length, who: line.speaker ?? 'Narrator', text: line.text });
      const utterance = new SpeechSynthesisUtterance(line.text);
      const voice = byName.get(voiceFor(line.speaker));
      if (voice) utterance.voice = voice;
      utterance.rate = Number(rate) || 1;
      utterance.onend = () => advance(index + 1);
      utterance.onerror = () => { if (active.current) stop(); };
      speech.speak(utterance);
    };
    advance(0);
  }

  const voiceOptions = names.map(name => ({ value: name, label: name }));
  return <section className="script-tools-section" aria-label="Table read">
    {now ? <div className="script-tools-now" aria-live="polite">
      <div className="script-tools-row"><strong>{now.who}</strong><small>Line {now.index + 1} of {now.total}</small></div>
      <p>{now.text}</p>
      <ProgressBar label="Table read progress" isLabelHidden value={Math.round((now.index + 1) / now.total * 100)} />
      <Button label="Stop reading" variant="secondary" icon={<Square size={14} />} onClick={stop} />
    </div> : <div className="script-tools-row">
      <p className="script-tools-muted">Each character reads in their own voice; the narrator takes headings and action. Voices come from this device.</p>
      <Button label="Start table read" variant="primary" icon={<Play size={14} />} onClick={start} isDisabled={!voices.length} />
    </div>}
    {!voices.length && <p className="script-tools-muted">No reading voices are available in this browser yet.</p>}
    <div className="script-tools-grid">
      <Selector label="Start from" value={from} onChange={setFrom} options={[{ value: '', label: 'The beginning' },
        ...scenes.map(scene => ({ value: scene.blockId, label: `${scene.number}. ${scene.heading || 'Untitled scene'}` }))]} />
      <Selector label="Speed" value={rate} onChange={setRate} options={[{ value: '0.8', label: 'Slow' }, { value: '1', label: 'Normal' }, { value: '1.2', label: 'Brisk' }, { value: '1.45', label: 'Fast' }]} />
      {voiceOptions.length > 0 && <Selector label="Narrator" value={narratorVoice} onChange={setNarrator} options={voiceOptions} />}
    </div>
    <fieldset className="script-tools-checks">
      <legend>Read aloud</legend>
      {([['headings', 'Scene headings'], ['action', 'Action'], ['cues', 'Character names'], ['parentheticals', 'Parentheticals']] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOptions(current => ({ ...current, [key]: event.target.checked }))} /> {label}</label>)}
    </fieldset>
    {cast.length > 0 && voiceOptions.length > 0 && <>
      <h3>Cast the voices</h3>
      <div className="script-tools-grid">{cast.slice(0, 12).map(name =>
        <Selector key={name} label={name} value={voiceFor(name)} onChange={value => setAssigned(current => ({ ...current, [name]: value }))} options={voiceOptions} />)}</div>
    </>}
  </section>;
}

/* ---------- Goals ---------- */

function GoalsTab({ goal, total, setDaily }: { goal: GoalState; total: number; setDaily: (daily: number) => void }) {
  const [draft, setDraft] = useState(goal.daily ? String(goal.daily) : '');
  const done = written(goal.days[today()]);
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${today()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, label: new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'UTC' }).format(date), words: written(goal.days[key]) };
  });
  const peak = Math.max(goal.daily, ...days.map(day => day.words), 1);
  return <section className="script-tools-section" aria-label="Writing goals">
    <dl className="script-tools-metrics">
      <div><dt>Today</dt><dd>{done.toLocaleString()} words</dd></div>
      <div><dt>Daily goal</dt><dd>{goal.daily ? goal.daily.toLocaleString() : '—'}</dd></div>
      <div><dt>Streak</dt><dd>{streak(goal)} {streak(goal) === 1 ? 'day' : 'days'}</dd></div>
      <div><dt>Project total</dt><dd>{total.toLocaleString()}</dd></div>
    </dl>
    {goal.daily > 0 && <ProgressBar label={`${Math.min(100, Math.round(done / goal.daily * 100))}% of today's goal`} value={Math.min(100, Math.round(done / goal.daily * 100))} variant={done >= goal.daily ? 'success' : 'accent'} />}
    <form className="script-tools-row script-tools-goal-form" onSubmit={event => { event.preventDefault(); const value = Math.max(0, Math.round(Number(draft) || 0)); setDaily(value); }}>
      <TextInput label="Daily word goal" value={draft} onChange={setDraft} placeholder="500" />
      <Button label={goal.daily ? 'Update goal' : 'Set goal'} variant="primary" type="submit" icon={<Target size={14} />} />
      {goal.daily > 0 && <Button label="Clear" variant="secondary" onClick={() => { setDraft(''); setDaily(0); }} />}
    </form>
    <h3>Last 14 days</h3>
    <ol className="script-tools-days" aria-label="Words written per day">{days.map(day =>
      <li key={day.key} title={`${day.key}: ${day.words} words`} className={goal.daily && day.words >= goal.daily ? 'is-met' : undefined}>
        <span style={{ height: `${Math.max(3, day.words / peak * 100)}%` }} /><small>{day.label}</small></li>)}</ol>
    <p className="script-tools-muted">Words written across this project's documents, counted on this device. A day counts towards the streak when it reaches the goal.</p>
  </section>;
}
