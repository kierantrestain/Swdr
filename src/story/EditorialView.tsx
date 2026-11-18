import { ArrowDown, ArrowUp, ClipboardCheck, Download, Expand, FileText, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { durationLabel } from '../model';
import type { Project, WorkspaceViewProps } from '../model';
import { BriefForm, ClaimForm, CueForm, EvidenceForm, SegmentForm } from './EditorialForms';
import {
  editorialRuntime, getEditorial, getEditorialDraft, issueCorrections, issueEditorial, issueManifest,
  OUTPUT_LABELS, previewEditorial, removeSegment, renderEditorialOutput, reorderSegments, saveBrief, saveClaim,
  saveEvidence, saveSegment, segmentTimes
} from './editorial-model';
import type { Claim, EditorialIssue, Evidence, Output, Segment, SourceVersion, VisualCue } from './editorial-model';
import { ClaimBoard } from './ClaimBoard';
import { SourceButton } from './StoryControls';
import { downloadText, episodeCode, fileStem, orderedEpisodes, upsert } from './source';

const panes = ['Segments', 'Sources', 'Claims', 'Host guide', 'Producer rundown', 'Graphics', 'Issues', 'Branded brief'] as const;
type Pane = (typeof panes)[number];
type FormState = { kind: 'segment'; segment?: Segment }
  | { kind: 'evidence'; item?: Evidence }
  | { kind: 'claim'; item?: Claim }
  | { kind: 'cue'; segmentId?: string; cue?: VisualCue }
  | { kind: 'brief' };

const outputKeys = Object.keys(OUTPUT_LABELS) as Output[];

function Bullets({ title, entries }: { title: string; entries: string[] }) {
  if (!entries.length) return null;
  return <section className="swdr-editorial-paragraph"><h3>{title}</h3><ul>{entries.map((entry, i) => <li key={`${i}-${entry}`}>{entry}</li>)}</ul></section>;
}

function safeURL(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function SourceCard({ item, edit }: { item: SourceVersion; edit?: () => void }) {
  const href = safeURL(item.url);
  return <article className="swdr-editorial-resource">
    <strong>{item.title}</strong>
    <small className={item.status === 'Verified' ? 'swdr-story-good' : 'swdr-story-caution'}>{[item.status, item.locator].filter(Boolean).join(' · ')}</small>
    {item.notes && <p>{item.notes}</p>}
    {href && <a href={href} target="_blank" rel="noopener noreferrer">Open source</a>}
    {edit && <button type="button" onClick={edit}>Correct source</button>}
  </article>;
}

function OutputPreview({ issue, output }: { issue: EditorialIssue; output: Output }) {
  const sections = renderEditorialOutput(issue, output).trim().split('\n\n');
  return <article className="swdr-story-card swdr-editorial-output">
    {sections.map((section, i) => {
      if (section.startsWith('### ')) return <h3 key={i}>{section.slice(4)}</h3>;
      if (section.startsWith('## ')) return <h2 key={i}>{section.slice(3)}</h2>;
      if (section.startsWith('# ')) return <h2 key={i}>{section.slice(2)}</h2>;
      if (section.startsWith('- ')) return <ul key={i}>{section.split('\n').map((line, index) => <li key={index}>{line.slice(2)}</li>)}</ul>;
      return <p key={i}>{section}</p>;
    })}
  </article>;
}

export function EditorialView({ project, document, onProjectChange, onOpenSource, onStatus, readOnly }: WorkspaceViewProps) {
  const episodes = orderedEpisodes(project);
  const [selectedDocumentId, setSelectedDocumentId] = useState(document.id);
  const current = project.documents.find(item => item.id === selectedDocumentId) ?? document;
  const episode = episodes.find(item => item.id === current.episodeId);
  const [pane, setPane] = useState<Pane>('Segments');
  const [segmentId, setSegmentId] = useState('');
  const [research, setResearch] = useState(true);
  const [focus, setFocus] = useState(false);
  const [form, setForm] = useState<FormState>();
  const [error, setError] = useState('');
  const [issueId, setIssueId] = useState('');
  const store = useMemo(() => getEditorial(project), [project]);
  const draft = getEditorialDraft(store, current.id);
  const timing = segmentTimes(draft.segments);
  const runtime = editorialRuntime(draft.segments);
  const active = draft.segments.find(segment => segment.id === segmentId) ?? draft.segments[0];
  const activeIndex = active ? draft.segments.findIndex(segment => segment.id === active.id) : -1;
  const matchingIssues = store.issues.filter(issue => issue.source.documentId === current.id).slice().reverse();
  const selectedIssue = matchingIssues.find(issue => issue.id === issueId) ?? matchingIssues[0];
  const preview = previewEditorial(project, current);
  const activeClaims = preview.claims.filter(claim => active?.claimIds.includes(claim.id));
  const activeSources = preview.sources.filter(source => active?.evidenceIds.includes(source.id)
    || activeClaims.some(claim => claim.version.evidenceIds.includes(source.id)));
  const docLabel = project.kind === 'commercial' ? 'Commercial' : project.kind === 'documentary' ? 'Documentary' : 'Long-form editorial';
  const minutes = Math.round(runtime / 60);

  useEffect(() => {
    if (!focus) return;
    function exit(event: KeyboardEvent) {
      if (event.key === 'Escape') setFocus(false);
    }
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [focus]);

  function update(action: (value: Project) => Project, message: string): boolean {
    try {
      onProjectChange(action);
      setError('');
      onStatus(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The editorial record could not be saved.');
      return false;
    }
  }

  function go(next: Pane) {
    setPane(next);
    setForm(undefined);
    setError('');
  }

  function issue() {
    if (update(value => issueEditorial(value, current.id), 'Four editorial outputs issued from the same revision.')) {
      setIssueId('');
      go('Issues');
    }
  }

  function exportOutput(source: EditorialIssue, kind: Output) {
    const suffix = source.number ? `issue-${source.number}` : 'working';
    downloadText(`${fileStem(source.documentTitle)}-${suffix}-${kind}.md`, renderEditorialOutput(source, kind));
    onStatus(`${OUTPUT_LABELS[kind]} exported.`);
  }

  function saveCue(id: string, cue: VisualCue, oldSegment?: string): boolean {
    return update(value => {
      const liveDraft = getEditorialDraft(getEditorial(value), current.id);
      const segment = liveDraft.segments.find(segment => segment.id === id);
      if (!segment || !cue.title) throw new Error('Enter a title and choose an episode segment.');
      let next = value;
      if (oldSegment && oldSegment !== id) {
        const previous = liveDraft.segments.find(segment => segment.id === oldSegment);
        if (previous) next = saveSegment(next, current.id, { ...previous, cues: previous.cues.filter(item => item.id !== cue.id) });
      }
      return saveSegment(next, current.id, { ...segment, cues: upsert(segment.cues, cue) });
    }, 'Visual cue saved.');
  }

  const close = () => setForm(undefined);
  const canEdit = !readOnly;
  const isSegmentPane = focus || pane === 'Segments';
  return <main className={`swdr-page swdr-story-page swdr-editorial-page${focus ? ' swdr-editorial-focus' : ''}`} id="main-content">
    <header className="page-heading swdr-story-heading">
      <div><h1>{current.title}</h1><p>{[docLabel, episode && episodeCode(episode), runtime > 0 && `${minutes}-minute outline`].filter(Boolean).join(' · ')}</p></div>
      <div className="actions swdr-story-filters">
        {project.documents.length > 1 && !focus && <select aria-label="Editorial document" value={current.id} onChange={event => {
          setSelectedDocumentId(event.currentTarget.value); setSegmentId(''); setIssueId(''); close();
        }}>{project.documents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>}
        {!focus && <button className={research ? 'selected' : ''} aria-pressed={research} onClick={() => setResearch(value => !value)}>Research layout</button>}
        <button className={focus ? 'selected' : ''} aria-pressed={focus} onClick={() => setFocus(value => !value)}><Expand size={15} />{focus ? 'Exit focus' : 'Focus'}</button>
        {canEdit && !focus && <button className="primary" onClick={issue} disabled={!draft.segments.length && !draft.brief}>Issue outputs</button>}
      </div>
    </header>
    {!focus && <nav className="swdr-story-tabs" aria-label="Editorial workspaces">{panes.map(item =>
      <button key={item} className={pane === item ? 'selected' : 'quiet'} aria-pressed={pane === item} onClick={() => go(item)}>{item}</button>)}</nav>}
    {error && <p className="swdr-story-error" role="alert">{error}</p>}
    {isSegmentPane && <div className={`swdr-editorial-layout${research && !focus ? ' has-research' : ''}`}>
      {!focus && <aside className="swdr-story-card swdr-editorial-segments"><h2>Episode segments</h2>
        <ol>{draft.segments.map((segment, i) => <li key={segment.id}>
          <button className={active?.id === segment.id ? 'selected' : ''} aria-pressed={active?.id === segment.id}
            onClick={() => { setSegmentId(segment.id); close(); }}><strong>{segment.title}</strong><small>{durationLabel(segment.seconds)} · starts {durationLabel(timing[i].from)}</small></button>
        </li>)}</ol>
        {canEdit && <button onClick={() => setForm({ kind: 'segment' })}><Plus size={14} /> Add segment</button>}
      </aside>}
      <section className="swdr-story-card swdr-editorial-main">
        {form?.kind === 'segment' && canEdit ? <SegmentForm key={form.segment?.id ?? 'new'} project={project} segment={form.segment} close={close}
          save={segment => {
            const saved = update(value => saveSegment(value, current.id, segment), 'Segment saved.');
            if (saved) setSegmentId(segment.id);
            return saved;
          }} /> : active ? <>
          <header className="swdr-editorial-segment-heading"><div><h2>{active.title}</h2>
            <p>{durationLabel(active.seconds)} estimated · {active.kind}</p></div>
            {canEdit && !focus && <div className="actions">
              <button onClick={() => setForm({ kind: 'segment', segment: active })}>Edit segment</button>
              <button aria-label="Move segment earlier" disabled={activeIndex <= 0}
                onClick={() => update(value => reorderSegments(value, current.id, active.id, -1), 'Segment moved earlier.')}><ArrowUp size={15} /></button>
              <button aria-label="Move segment later" disabled={activeIndex >= draft.segments.length - 1}
                onClick={() => update(value => reorderSegments(value, current.id, active.id, 1), 'Segment moved later.')}><ArrowDown size={15} /></button>
            </div>}
          </header>
          {active.purpose && <section className="swdr-editorial-paragraph"><h3>Purpose</h3><p>{active.purpose}</p></section>}
          <Bullets title="Key talking points" entries={active.points} />
          <Bullets title="Questions" entries={active.questions} />
          <Bullets title="Counterarguments" entries={active.counterarguments} />
          {activeClaims.length > 0 && <section className="swdr-editorial-paragraph"><h3>Linked claims</h3><ul>{activeClaims.map(claim =>
            <li key={claim.id}><strong>{claim.version.status}</strong> · {claim.version.text}</li>)}</ul></section>}
          {!focus && <footer className="swdr-editorial-segment-foot">
            <button className="quiet" onClick={() => go('Sources')}>{activeSources.length} linked source{activeSources.length === 1 ? '' : 's'}</button>
            <button className="quiet" onClick={() => go('Graphics')}>{active.cues.length} visual cue{active.cues.length === 1 ? '' : 's'}</button>
            {canEdit && <button className="quiet" onClick={() => {
              if (window.confirm('Remove this segment from the working outline?')) update(value => removeSegment(value, current.id, active.id), 'Segment removed.');
            }}>Remove segment</button>}
          </footer>}
        </> : <div className="swdr-story-empty"><FileText size={26} /><h2>Start the episode outline</h2>
          <p>Add a segment with its runtime, talking points and evidence.</p>
          {canEdit && <button className="primary" onClick={() => setForm({ kind: 'segment' })}>Add first segment</button>}</div>}
      </section>
      {research && !focus && <aside className="swdr-story-card swdr-editorial-research">
        <h2>Research and evidence</h2>
        {activeSources.map(source => <SourceCard key={source.id} item={source.version} />)}
        {!activeSources.length && <p className="swdr-story-muted">No evidence linked to this segment.</p>}
        <h2>Graphics and cues</h2>
        {active?.cues.map(cue => <article className="swdr-editorial-resource" key={cue.id}><strong>{cue.title}</strong><small>{cue.type} · {cue.status}</small></article>)}
        <button onClick={() => go('Graphics')}>Open graphics register</button>
      </aside>}
    </div>}
    {!focus && pane === 'Sources' && <div className="swdr-story-stack">
      <div className="actions">{canEdit && <>
        <button className="primary" onClick={() => setForm({ kind: 'evidence' })}><Plus size={15} /> Add source</button>
        <button onClick={() => setForm({ kind: 'claim' })}><Plus size={15} /> Add shared claim</button></>}
        <button onClick={() => exportOutput(preview, 'research')}><Download size={15} /> Download research preview</button>
      </div>
      {form?.kind === 'evidence' && canEdit && <EvidenceForm project={project} key={form.item?.id ?? 'new-source'} item={form.item} close={close}
        save={(source, id, correction) => update(value => saveEvidence(value, source, id, correction), 'Source version saved.')} />}
      {form?.kind === 'claim' && canEdit && <ClaimForm project={project} key={form.item?.id ?? 'new-claim'} item={form.item} close={close}
        save={(claim, id, correction) => update(value => saveClaim(value, claim, id, correction), 'Claim version saved.')} />}
      <div className="swdr-editorial-source-grid">
        <section className="swdr-story-card"><h2>Project evidence</h2>
          {store.evidence.map(item => {
            const version = item.versions.at(-1);
            return version && <div key={item.id}><SourceCard item={version} edit={canEdit ? () => setForm({ kind: 'evidence', item }) : undefined} />
              {item.versions.length > 1 && <details className="swdr-editorial-history"><summary>Correction history</summary>
                <ul>{item.versions.slice().reverse().map(entry => <li key={entry.revisionId}>{entry.title} · {entry.correction || 'Original source'}</li>)}</ul>
              </details>}</div>;
          })}
          {!store.evidence.length && <p className="swdr-story-muted">Add evidence to cite it in segments and claims.</p>}
        </section>
        <section className="swdr-story-card"><h2>Shared claims</h2>
          {store.claims.map(item => {
            const version = item.versions.at(-1);
            const linked = store.evidence.filter(evidence => version?.evidenceIds.includes(evidence.id));
            return version && <div className="swdr-editorial-resource" key={item.id}>
              <strong>{version.text}</strong><small>{version.status} · {linked.map(source => source.versions.at(-1)?.title).filter(Boolean).join(', ') || 'No linked evidence'}</small>
              {canEdit && <button onClick={() => setForm({ kind: 'claim', item })}>Correct claim</button>}
              {item.versions.length > 1 && <details className="swdr-editorial-history"><summary>Correction history</summary>
                <ul>{item.versions.slice().reverse().map(entry => <li key={entry.revisionId}>{entry.text} · {entry.correction || 'Original claim'}</li>)}</ul>
              </details>}
            </div>;
          })}
          {!store.claims.length && <p className="swdr-story-muted">A shared claim can be linked from more than one episode.</p>}
        </section>
      </div>
    </div>}
    {!focus && pane === 'Claims' && <div className="swdr-story-stack">
      {form?.kind === 'claim' && canEdit && <ClaimForm project={project} key={form.item?.id ?? 'new-claim'} item={form.item} close={close}
        save={(claim, id, correction) => update(value => saveClaim(value, claim, id, correction), 'Claim version saved.')} />}
      <ClaimBoard project={project} store={store} documentId={current.id} onOpen={onOpenSource}
        openSegment={(documentId, id) => { setSelectedDocumentId(documentId); setSegmentId(id); setIssueId(''); go('Segments'); }}
        correct={canEdit ? id => setForm({ kind: 'claim', item: store.claims.find(claim => claim.id === id) }) : undefined} />
    </div>}
    {!focus && (pane === 'Host guide' || pane === 'Producer rundown') && <div className="swdr-story-stack">
      <div className="actions"><button onClick={() => exportOutput(preview, pane === 'Host guide' ? 'host' : 'rundown')}><Download size={15} /> Download working preview</button></div>
      <OutputPreview issue={preview} output={pane === 'Host guide' ? 'host' : 'rundown'} />
    </div>}
    {!focus && pane === 'Graphics' && <div className="swdr-story-stack">
      <div className="actions">
        {canEdit && <button className="primary" disabled={!draft.segments.length} onClick={() => setForm({ kind: 'cue', segmentId: active?.id })}><Plus size={15} /> Add visual cue</button>}
        <button onClick={() => exportOutput(preview, 'graphics')}><Download size={15} /> Download register preview</button>
      </div>
      {form?.kind === 'cue' && canEdit && <CueForm key={form.cue?.id ?? 'new-cue'} project={project} segments={draft.segments} segmentId={form.segmentId} cue={form.cue}
        close={close} save={(id, cue) => saveCue(id, cue, form.segmentId)} />}
      <section className="swdr-story-card"><h2>Graphics and asset register</h2>
        <div className="swdr-story-table"><table><thead><tr><th>Visual cue</th><th>Segment</th><th>Type</th><th>Approval</th><th>Asset</th>{canEdit && <th>Edit</th>}</tr></thead>
          <tbody>{draft.segments.flatMap(segment => segment.cues.map(cue => <tr key={cue.id}>
            <td><strong>{cue.title}</strong>{cue.specification && <small>{cue.specification}</small>}</td>
            <td>{segment.title}</td><td>{cue.type}</td><td>{cue.status}</td>
            <td>{project.assets.find(asset => asset.id === cue.assetId)?.name || '—'}</td>
            {canEdit && <td><button onClick={() => setForm({ kind: 'cue', segmentId: segment.id, cue })}>Edit cue</button></td>}
          </tr>))}</tbody>
        </table></div>
        {!draft.segments.some(segment => segment.cues.length) && <p className="swdr-story-muted">No visual cues in this outline.</p>}
      </section>
    </div>}
    {!focus && pane === 'Issues' && <section className="swdr-story-card swdr-story-stack"><h2>Issued outputs</h2>
      {selectedIssue ? <>
        <label>Editorial issue<select value={selectedIssue.id} onChange={event => setIssueId(event.currentTarget.value)}>
          {matchingIssues.map(item => <option key={item.id} value={item.id}>Issue {item.number} · {new Date(item.issuedAt).toLocaleString('en-GB')}</option>)}
        </select></label>
        {issueCorrections(store, selectedIssue).length > 0 && <div className="swdr-story-conflict" role="status">
          <strong>Reissue after source corrections</strong><p>{issueCorrections(store, selectedIssue).join(' · ')}</p>
          <small>This issue remains available in its original version.</small>
        </div>}
        <p className="swdr-story-muted">Editorial revision {selectedIssue.draft.revisionId} · {durationLabel(editorialRuntime(selectedIssue.draft.segments))}</p>
        <SourceButton project={project} source={selectedIssue.source} onOpen={onOpenSource} label="Open retained script revision" />
        <div className="swdr-story-event-cards">{outputKeys.map(kind => <article className="swdr-story-person-card" key={kind}>
          <h3>{OUTPUT_LABELS[kind]}</h3><button onClick={() => exportOutput(selectedIssue, kind)}><Download size={15} /> Download</button>
        </article>)}</div>
        <div className="actions"><button onClick={() => {
          downloadText(`${fileStem(current.title)}-issue-${selectedIssue.number}-manifest.json`, JSON.stringify(issueManifest(selectedIssue), null, 2), 'application/json');
          onStatus('Output manifest exported.');
        }}>Download output manifest</button></div>
      </> : <p className="swdr-story-muted">Issue the outline to freeze four outputs and their sources together.</p>}
    </section>}
    {!focus && pane === 'Branded brief' && <div className="swdr-story-stack">
      {form?.kind === 'brief' && canEdit ? <BriefForm project={project} brief={draft.brief} close={close}
        save={brief => update(value => saveBrief(value, current.id, brief), 'Branded brief saved.')} /> :
        <section className="swdr-story-card">
          <div className="swdr-story-card-head"><h2>{draft.brief?.client ?? 'Branded brief'}</h2>
            {canEdit && <button onClick={() => setForm({ kind: 'brief' })}>{draft.brief ? 'Edit brief' : 'Create brief'}</button>}</div>
          {draft.brief ? <>
            <dl className="swdr-story-facts">
              <dt>Objective</dt><dd>{draft.brief.objective}</dd><dt>Audience</dt><dd>{draft.brief.audience || '—'}</dd>
              <dt>Copy</dt><dd>{draft.brief.copy || '—'}</dd><dt>Approval</dt><dd><ClipboardCheck size={15} /> {[draft.brief.approval, draft.brief.approver].filter(Boolean).join(' · ')}</dd>
            </dl>
            <Bullets title="Deliverables" entries={draft.brief.deliverables} />
            {draft.brief.avSource && <SourceButton project={project} source={draft.brief.avSource} onOpen={onOpenSource} label="Open retained AV version" />}
          </> : <p className="swdr-story-muted">Connect client copy, deliverables and approvals to an AV revision.</p>}
        </section>}
    </div>}
  </main>;
}
