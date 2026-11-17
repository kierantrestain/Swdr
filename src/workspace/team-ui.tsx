import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowLeft, Clock3, FileText, Home, Link, LockKeyhole, MessageCircle, Users } from 'lucide-react';
import { sourceFor } from '../model';
import type { DocumentModel, Project, SourceRef, WorkspaceViewProps } from '../model';
import { issueDocument, resolveSource } from './project';
import { errorMessage, TeamRequestError, teamRequest, useTeamDraft } from './team-client';
import type { TeamLocalStatus, TeamServerStatus } from './team-client';
import type { LineChange, ReviewDocument, TeamGrant, TeamListing, TeamNote, TeamProject, TeamRole } from './team-contract';
import './team.css';

export interface TeamRenderProps extends WorkspaceViewProps {
  grant: TeamGrant;
  localStatus: TeamLocalStatus;
  serverStatus: TeamServerStatus;
  selectedSource?: SourceRef;
  openDocument: (id: string) => void;
}

interface TeamWorkspaceProps {
  localProjects: Project[];
  onHome: () => void;
  renderWorkspace: (view: TeamRenderProps) => ReactNode;
}

type Panel = 'people' | 'feedback' | 'history' | 'review';
type MemberRole = Exclude<TeamRole, 'owner'>;

const localLabels: Record<TeamLocalStatus, string> = {
  saved: 'Saved locally', saving: 'Saving locally', error: 'Local save failed'
};

const serverLabels: Record<TeamServerStatus, string> = {
  synced: 'Team synced', pending: 'Sync pending', syncing: 'Syncing', offline: 'Offline',
  conflict: 'Edit conflict', denied: 'Access changed', error: 'Sync failed'
};

function LoginForm({ onLogin, disabled }: { onLogin: (email: string, key: string) => void; disabled: boolean }) {
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  return <form className="team-form" onSubmit={event => {
    event.preventDefault();
    onLogin(email, key);
  }}>
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Team access key<input type="password" autoComplete="current-password" required value={key} onChange={event => setKey(event.target.value)} /></label>
    <button type="submit" disabled={disabled}>Sign in</button>
  </form>;
}

function AccessPanel({ project, grants, onGrant, disabled }: {
  project: Project;
  grants: TeamGrant[];
  onGrant: (email: string, role: MemberRole | null, episodeIds: string[] | null) => void;
  disabled: boolean;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [episodeId, setEpisodeId] = useState('');
  return <section aria-label="Project access" className="team-panel">
    <h3>Project access</h3>
    <ul className="team-list">
      {grants.map(grant => <li key={grant.email}>
        <span>{grant.email}<small>{grant.role} · {grant.episodeIds?.map(id => project.episodes.find(episode => episode.id === id)?.title ?? 'Episode').join(', ') ?? 'All episodes'}</small></span>
        {grant.role !== 'owner' && <button disabled={disabled} onClick={() => onGrant(grant.email, null, null)}>Revoke</button>}
      </li>)}
    </ul>
    <form className="team-inline-form" onSubmit={event => {
      event.preventDefault();
      onGrant(email, role, episodeId ? [episodeId] : null);
    }}>
      <label>Member email<input type="email" placeholder="writer@example.com" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label>Role<select value={role} onChange={event => setRole(event.target.value as MemberRole)}>
        <option value="editor">Editor</option><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option>
      </select></label>
      <label>Episode scope<select value={episodeId} onChange={event => setEpisodeId(event.target.value)}>
        <option value="">Whole project</option>
        {project.episodes.map(episode => <option value={episode.id} key={episode.id}>S{episode.season} · E{episode.number} · {episode.title}</option>)}
      </select></label>
      <button type="submit" disabled={disabled}>Save access</button>
    </form>
  </section>;
}

function LinePicker({ document, value, onChange }: { document: DocumentModel; value: string; onChange: (id: string) => void }) {
  return <label>Script line<select value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Select a line</option>
    {document.blocks.map((block, index) => <option key={block.id} value={block.id}>
      {index + 1} · {block.text.slice(0, 100) || block.kind}
    </option>)}
  </select></label>;
}

function EditNoteForm({ onSubmit, disabled }: { onSubmit: (kind: 'comment' | 'suggestion', text: string) => void; disabled: boolean }) {
  const [kind, setKind] = useState<'comment' | 'suggestion'>('comment');
  const [text, setText] = useState('');
  return <form className="team-form" onSubmit={event => {
    event.preventDefault();
    onSubmit(kind, text);
    setText('');
  }}>
    <label>Type<select value={kind} onChange={event => setKind(event.target.value as 'comment' | 'suggestion')}>
      <option value="comment">Comment</option><option value="suggestion">Suggested replacement</option>
    </select></label>
    <label>{kind === 'comment' ? 'Comment' : 'Replacement text'}
      <textarea value={text} maxLength={kind === 'comment' ? 10000 : 200000} onChange={event => setText(event.target.value)} required={kind === 'comment'} />
    </label>
    <button disabled={disabled} type="submit">{kind === 'comment' ? 'Add comment' : 'Send suggestion'}</button>
  </form>;
}

function IssuedLinkPanel({ project, onIssue, onShare, onRevoke, canShare, disabled }: {
  project: Project;
  onIssue: (label: string) => void;
  onShare: (snapshotId: string, hours: number) => Promise<string | undefined>;
  onRevoke: (key: string) => Promise<void>;
  canShare: boolean;
  disabled: boolean;
}) {
  const [label, setLabel] = useState('');
  const [snapshotId, setSnapshotId] = useState('');
  const [hours, setHours] = useState(24);
  const [key, setKey] = useState('');
  const link = key ? `${window.location.origin}${window.location.pathname}#review=${key}` : '';
  return <section aria-label="Issued drafts and review links" className="team-panel">
    <h3>Issued drafts</h3>
    <form className="team-inline-form" onSubmit={event => {
      event.preventDefault();
      onIssue(label);
      setLabel('');
    }}>
      <label>Issue label<input value={label} onChange={event => setLabel(event.target.value)} required maxLength={250} /></label>
      <button disabled={disabled} type="submit">Issue active draft</button>
    </form>
    {canShare && <form className="team-inline-form" onSubmit={event => {
      event.preventDefault();
      void onShare(snapshotId, hours).then(reviewKey => { if (reviewKey) setKey(reviewKey); });
    }}>
      <label>Issued revision<select value={snapshotId} onChange={event => setSnapshotId(event.target.value)} required>
        <option value="">Choose an issued draft</option>
        {project.snapshots.filter(snapshot => snapshot.kind === 'issued').map(snapshot => <option key={snapshot.id} value={snapshot.id}>{snapshot.label}</option>)}
      </select></label>
      <label>Expires in hours<input type="number" min={1} max={168} value={hours} onChange={event => setHours(event.target.valueAsNumber)} required /></label>
      <button type="submit" disabled={disabled}>Create review link</button>
    </form>}
    {link && <div className="team-inline-form">
      <label>Review link<input readOnly value={link} onFocus={event => event.target.select()} /></label>
      <button disabled={disabled} type="button" onClick={() => { void onRevoke(key).then(() => setKey('')); }}>Revoke link</button>
    </div>}
  </section>;
}

export function TeamWorkspace({ localProjects, onHome, renderWorkspace }: TeamWorkspaceProps) {
  const draft = useTeamDraft();
  const { state, resume, forget } = draft;
  const [email, setEmail] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string>();
  const [projects, setProjects] = useState<TeamListing[]>([]);
  const [shareId, setShareId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [source, setSource] = useState<SourceRef>();
  const [panel, setPanel] = useState<Panel>();
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [history, setHistory] = useState<LineChange[]>([]);
  const [blockId, setBlockId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const session = await teamRequest<{ email: string }>('session');
        if (cancelled) return;
        setEmail(session.email);
        const list = await teamRequest<TeamListing[]>('list');
        if (cancelled) return;
        setProjects(list);
        await resume(session.email);
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof TeamRequestError && cause.status === 401) {
          await forget();
        } else if (cause instanceof TeamRequestError && cause.status === 0) {
          const cachedEmail = await resume().catch(() => undefined);
          if (!cancelled) setEmail(cachedEmail);
        } else {
          setMessage(errorMessage(cause));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void start();
    return () => { cancelled = true; };
  }, [forget, resume]);

  const handle = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setMessage(undefined);
    try {
      return await work();
    } catch (error) {
      setMessage(errorMessage(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const onLogin = (loginEmail: string, key: string) => {
    void handle(async () => {
      const session = await teamRequest<{ email: string }>('login', { email: loginEmail, key });
      await forget();
      setEmail(session.email);
      setProjects(await teamRequest<TeamListing[]>('list'));
    });
  };

  const selectDocument = useCallback((next: string) => {
    setDocumentId(next);
    setSource(undefined);
    setBlockId('');
    setHistory([]);
  }, []);

  const openProject = (projectId: string, initial?: TeamProject) => void handle(async () => {
    if (!email) return;
    selectDocument('');
    setPanel(undefined);
    await draft.open(projectId, email, initial);
  });

  const onShare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const local = localProjects.find(project => project.id === shareId);
    if (!local) return;
    void handle(async () => {
      const shared = await teamRequest<TeamProject>('create', { project: local });
      setProjects(await teamRequest<TeamListing[]>('list'));
      selectDocument('');
      await draft.open(shared.project.id, email!, shared);
    });
  };

  const project = state?.draft ?? state?.head.project;
  const grant = state?.head.grant;
  const current = project?.documents.find(document => document.id === documentId) ?? project?.documents[0];
  const document = source && project ? resolveSource(project, source) ?? current : current;
  const openSource = useCallback((next: SourceRef) => {
    if (!project || !resolveSource(project, next)) {
      setMessage('This source revision is unavailable in your scope.');
      return;
    }
    setDocumentId(next.documentId);
    setBlockId(next.blockId ?? '');
    const head = project.documents.find(item => item.id === next.documentId);
    setSource(head?.revisionId === next.revisionId && !next.sceneId && !next.blockId ? undefined : next);
  }, [project]);

  const projectId = project?.id;
  const refreshNotes = useCallback(async () => {
    if (projectId) setNotes(await teamRequest<TeamNote[]>('notes', { projectId }));
  }, [projectId]);

  const currentDocumentId = document?.id;
  const refreshHistory = useCallback(async () => {
    if (!projectId || !currentDocumentId || !blockId) return;
    setHistory(await teamRequest<LineChange[]>('history', {
      projectId, documentId: currentDocumentId, blockId
    }));
  }, [blockId, currentDocumentId, projectId]);

  useEffect(() => {
    if (panel === 'history' && blockId) void refreshHistory().catch(error => setMessage(errorMessage(error)));
  }, [blockId, panel, refreshHistory]);

  useEffect(() => {
    if (panel !== 'feedback') return;
    const update = () => { void refreshNotes().catch(error => setMessage(errorMessage(error))); };
    update();
    const timer = window.setInterval(update, 2500);
    return () => window.clearInterval(timer);
  }, [panel, refreshNotes]);

  const editor = grant?.role === 'owner' || grant?.role === 'editor';
  const connected = draft.serverStatus === 'synced';
  const showPanel = (next: Panel) => {
    setPanel(panel === next ? undefined : next);
    if (next === 'people' && project) {
      void handle(async () => setGrants(await teamRequest<TeamGrant[]>('grants', { projectId: project.id })));
    }
  };

  return <div className="team-workspace">
    <header className="team-toolbar">
      <button onClick={onHome}><Home size={16} /> Home</button>
      <div className="team-heading">{project?.title ?? 'Private team'}</div>
      {state && <>
        <span role="status" className="team-save-status">{localLabels[draft.localStatus]} · {serverLabels[draft.serverStatus]}</span>
        <button onClick={() => { void draft.flush(); }} disabled={draft.serverStatus === 'syncing' || draft.serverStatus === 'conflict'}>Sync</button>
      </>}
      {email && <button onClick={() => { void handle(async () => {
        if (state?.draft || state?.pending || state?.conflict) throw new Error('Sync or recover pending edits before signing out.');
        await teamRequest('logout');
        await forget();
        setEmail(undefined);
        setProjects([]);
      }); }}>Sign out</button>}
    </header>
    <div className="team-body">
      {(message || draft.message) && <p role="status" className="team-message">{message || draft.message}</p>}
      {!email && <section className="team-auth">
        <LockKeyhole size={24} />
        <h1>Private team workspace</h1>
        {busy ? <p>Opening workspace…</p> : <LoginForm onLogin={onLogin} disabled={busy} />}
      </section>}
      {email && !project && <section className="team-library">
        <h1>Team projects</h1>
        <p>{email}</p>
        <ul className="team-list">
          {projects.map(item => <li key={item.id}>
            <span>{item.title} <small>{item.kind} · {item.role}</small></span>
            <button disabled={busy} onClick={() => openProject(item.id)}>Open</button>
          </li>)}
        </ul>
        {projects.length === 0 && <p>No team projects are available.</p>}
        <form className="team-inline-form" onSubmit={onShare}>
          <label>Share a local project<select required value={shareId} onChange={event => setShareId(event.target.value)}>
            <option value="">Select a project</option>
            {localProjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <button disabled={busy} type="submit">Create private copy</button>
        </form>
      </section>}
      {email && project && grant && <section className="team-editor">
        <div className="team-editor-tools">
          <button onClick={() => { void handle(async () => {
            await draft.close();
            setProjects(await teamRequest<TeamListing[]>('list'));
          }); }}><ArrowLeft size={15}/> Projects</button>
          <label>Document<select value={current?.id ?? ''} onChange={event => selectDocument(event.target.value)}>
            {project.documents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <button onClick={() => showPanel('feedback')} aria-expanded={panel === 'feedback'}><MessageCircle size={15}/> Feedback</button>
          <button onClick={() => showPanel('history')} aria-expanded={panel === 'history'}><Clock3 size={15}/> Line history</button>
          {grant.role === 'owner' && <button onClick={() => showPanel('people')} aria-expanded={panel === 'people'}><Users size={15}/> Access</button>}
          {editor && <button onClick={() => showPanel('review')} aria-expanded={panel === 'review'}><Link size={15}/> Issue &amp; review</button>}
        </div>
        {state?.conflict && <section className="team-panel" aria-label="Edit conflict">
          <h3>Another writer changed this draft</h3>
          <p>Choose whether to keep your version in the draft history before reopening the synced version.</p>
          <div className="team-inline-form">
            <button onClick={() => draft.resolve('stash')}>Stash my script</button>
            <button onClick={() => draft.resolve('server')}>Discard local edit and use team draft</button>
          </div>
        </section>}
        {panel === 'people' && <AccessPanel project={project} grants={grants} disabled={busy || !connected} onGrant={(memberEmail, role, episodeIds) => {
          void handle(async () => setGrants(await teamRequest<TeamGrant[]>('grant', { projectId, email: memberEmail, role, episodeIds })));
        }} />}
        {panel === 'feedback' && document && <section className="team-panel" aria-label="Script feedback">
          <h3>Feedback</h3>
          <LinePicker document={document} value={blockId} onChange={setBlockId} />
          {grant.role !== 'viewer' && <EditNoteForm disabled={!blockId || busy || !connected} onSubmit={(kind, text) => {
            const original = document.blocks.find(block => block.id === blockId)?.text;
            void handle(async () => {
              await teamRequest('add-note', { projectId, documentId: document.id, revisionId: document.revisionId, blockId, kind, text, original });
              await refreshNotes();
            });
          }} />}
          <ul className="team-notes">
            {notes.filter(note => note.documentId === document.id && (!blockId || note.blockId === blockId)).map(note => <li key={note.id}>
              <div><strong>{note.author}</strong> <small>{note.kind} · {note.state}</small><p>{note.text}</p></div>
              <button type="button" onClick={() => {
                const snapshot = project.snapshots.find(entry => entry.document.id === note.documentId && entry.document.revisionId === note.revisionId);
                const linked = snapshot?.document ?? current;
                if (linked?.revisionId === note.revisionId) openSource(sourceFor(project, linked, { blockId: note.blockId }));
                else setMessage('The original draft has not been retained as a named revision.');
              }}>Open source</button>
              {editor && note.state === 'open' && (note.kind === 'comment' ? ['resolved'] : ['accepted', 'rejected']).map(decision => <button key={decision} disabled={busy || !connected} onClick={() => {
                void handle(async () => {
                  draft.acceptServer(await teamRequest<TeamProject>('settle-note', { projectId, noteId: note.id, state: decision }));
                  await refreshNotes();
                });
              }}>{decision === 'resolved' ? 'Resolve' : decision === 'accepted' ? 'Accept' : 'Reject'}</button>)}
            </li>)}
          </ul>
        </section>}
        {panel === 'history' && document && <section className="team-panel" aria-label="Line history">
          <h3>Line history</h3>
          <LinePicker document={document} value={blockId} onChange={value => { setHistory([]); setBlockId(value); }} />
          {blockId && history.length === 0 && <p>No saved changes to this line.</p>}
          <ul className="team-notes">
            {history.map(change => <li key={change.version}>
              <div><strong>{change.author}</strong> <small>{new Date(change.createdAt).toLocaleString()}</small><p>{change.previous} → {change.text}</p></div>
              {editor && <button disabled={busy || !connected} onClick={() => {
                void handle(async () => {
                  draft.acceptServer(await teamRequest<TeamProject>('restore-line', {
                    projectId, documentId: document.id, blockId,
                    version: state?.head.version, changeVersion: change.version, restorePrevious: true
                  }));
                  await refreshHistory();
                });
              }}>Restore previous line</button>}
            </li>)}
          </ul>
        </section>}
        {panel === 'review' && current && editor && <IssuedLinkPanel project={project} canShare={grant.role === 'owner'} disabled={busy || !connected}
          onIssue={label => draft.edit(value => issueDocument(value, current.id, label).project)}
          onShare={(snapshotId, hours) => handle(async () => (await teamRequest<{ key: string }>('create-review', { projectId, snapshotId, hours })).key)}
          onRevoke={async key => { await handle(async () => { await teamRequest('revoke-review', { projectId, key }); }); }}
        />}
        {document && renderWorkspace({
          project, document, grant, readOnly: !editor || !!state?.conflict || document.revisionId !== current?.revisionId,
          localStatus: draft.localStatus, serverStatus: draft.serverStatus,
          selectedSource: source, openDocument: selectDocument, onOpenSource: openSource,
          onStatus: setMessage, onProjectChange: draft.edit,
          onDocumentChange: mutation => draft.edit(value => ({
            ...value,
            documents: value.documents.map(item => item.id === document.id
              ? typeof mutation === 'function' ? mutation(item) : mutation
              : item)
          }))
        })}
        {!document && <p>No documents are available in your episode scope.</p>}
      </section>}
    </div>
  </div>;
}

export function ReviewWorkspace({ reviewKey, onHome }: { reviewKey: string; onHome: () => void }) {
  const [review, setReview] = useState<ReviewDocument>();
  const [message, setMessage] = useState<string>('Opening issued draft…');
  useEffect(() => {
    let stopped = false;
    let expiryTimer: number;
    const refresh = async () => {
      try {
        const issued = await teamRequest<ReviewDocument>('review', { key: reviewKey });
        if (stopped) return;
        setReview(issued);
        window.clearTimeout(expiryTimer);
        expiryTimer = window.setTimeout(() => {
          setReview(undefined);
          setMessage('This review link has expired.');
        }, Math.max(0, new Date(issued.expiresAt).getTime() - Date.now()));
      } catch (error) {
        if (!stopped) {
          setReview(undefined);
          setMessage(errorMessage(error));
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(expiryTimer);
    };
  }, [reviewKey]);

  return <div className="team-workspace">
    <header className="team-toolbar">
      <button onClick={onHome}><Home size={16} /> Home</button>
      <div className="team-heading">{review?.title ?? 'Issued review'}</div>
      {review && <span>Read only · {review.snapshot.label}</span>}
    </header>
    {review ? <article className="team-review">
      <h1><FileText size={22}/> {review.snapshot.document.title}</h1>
      <p>{review.snapshot.label} · {new Date(review.snapshot.createdAt).toLocaleDateString()}</p>
      {review.snapshot.document.kind === 'av' ? <table><thead><tr><th>Video</th><th>Audio</th><th>Seconds</th></tr></thead>
        <tbody>{review.snapshot.document.avRows.map(row => <tr key={row.id}><td>{row.video}</td><td>{row.audio}</td><td>{row.durationSeconds}</td></tr>)}</tbody>
      </table> : review.snapshot.document.blocks.map(block => <p key={block.id} className={`review-${block.kind}`}>{block.text}</p>)}
    </article> : <div role="status" className="team-body team-message">{message}</div>}
  </div>;
}
