import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Copy, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { creatorModule, PLATFORMS } from './creator/model';
import type { DocumentModel, Project } from './model';
import { scriptReport } from './writing/script-insights';

interface Pitch { logline: string; genre: string; comps: string; contact: string }

export function pitchOf(project: Project): Pitch {
  const saved = (project.modules.pitch ?? {}) as Partial<Pitch>;
  const firstSentence = project.synopsis.split(/(?<=[.!?])\s+/)[0] ?? '';
  return { logline: saved.logline ?? firstSentence, genre: saved.genre ?? '', comps: saved.comps ?? '', contact: saved.contact ?? '' };
}

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** The facts a one-sheet can state about the project, measured from its scripts. */
export function pitchFacts(project: Project, document?: DocumentModel) {
  const report = document && document.kind !== 'av' ? scriptReport(document) : undefined;
  const facts: Array<[string, string]> = [];
  if (project.episodes.length) facts.push(['Episodes', `${project.episodes.length} across ${new Set(project.episodes.map(item => item.season)).size} ${new Set(project.episodes.map(item => item.season)).size === 1 ? 'season' : 'seasons'}`]);
  if (report && report.pages) {
    facts.push(['Length', `${report.pages} ${report.pages === 1 ? 'page' : 'pages'} · about ${report.minutes} ${report.minutes === 1 ? 'minute' : 'minutes'}`]);
    facts.push(['Scenes', `${report.scenes} ${report.scenes === 1 ? 'scene' : 'scenes'} · ${report.locations.length} ${report.locations.length === 1 ? 'location' : 'locations'}`]);
    const total = report.scenes || 1;
    facts.push(['Settings', `${Math.round(report.settings.INT / total * 100)}% interior · ${Math.round((report.settings.EXT + report.settings['INT/EXT']) / total * 100)}% exterior`]);
  }
  const pieces = creatorModule(project).pieces;
  if (pieces.length) {
    const long = pieces.filter(item => PLATFORMS[item.platform].form === 'long').length;
    facts.push(['Slate', `${long} long-form · ${pieces.length - long} short-form videos`]);
    facts.push(['Platforms', [...new Set(pieces.map(item => PLATFORMS[item.platform].label))].join(', ')]);
  }
  const characters = report ? report.characters.slice(0, 5).map(item => ({ name: item.name, share: report.dialogueWords ? Math.round(item.words / report.dialogueWords * 100) : 0, scenes: item.scenes })) : [];
  return { facts, characters };
}

export function PitchSheet({ project, document, update, onClose }: {
  project: Project; document?: DocumentModel; update: (change: (project: Project) => Project) => void; onClose: () => void;
}) {
  const [pitch, setPitch] = useState(() => pitchOf(project));
  const { facts, characters } = useMemo(() => pitchFacts(project, document), [project, document]);
  const set = (field: keyof Pitch, value: string) => {
    const next = { ...pitch, [field]: value };
    setPitch(next);
    update(current => ({ ...current, modules: { ...current.modules, pitch: next }, updatedAt: new Date().toISOString() }));
  };
  const comps = pitch.comps.split(/[,\n]/).map(item => item.trim()).filter(Boolean);

  const text = [project.title.toUpperCase(), [pitch.genre, project.kind].filter(Boolean).join(' · '), '', pitch.logline, '', project.synopsis,
    facts.length ? `\n${facts.map(([label, value]) => `${label}: ${value}`).join('\n')}` : '',
    characters.length ? `\nKey characters: ${characters.map(item => item.name).join(', ')}` : '', comps.length ? `Comparable titles: ${comps.join(' · ')}` : '', pitch.contact ? `\n${pitch.contact}` : '']
    .filter(line => line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  function print() {
    const page = window.open('', '_blank', 'width=900,height=1100');
    if (!page) return;
    page.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(project.title)} — one-sheet</title><style>
      @page { size: A4; margin: 18mm; } body { font: 11pt/1.5 Georgia, 'Times New Roman', serif; color: #111; max-width: 170mm; margin: 0 auto; }
      h1 { font-size: 30pt; letter-spacing: .02em; margin: 0 0 2mm; text-transform: uppercase; } .meta { font: 600 9pt/1.4 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #666; }
      .logline { font-size: 15pt; font-style: italic; margin: 8mm 0; padding-left: 5mm; border-left: 3px solid #111; } h2 { font: 700 9pt system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #666; margin: 7mm 0 2mm; }
      dl { display: grid; grid-template-columns: 32mm 1fr; gap: 1.5mm 4mm; margin: 0; } dt { font: 600 9pt system-ui, sans-serif; color: #444; } dd { margin: 0; }
      ul { margin: 0; padding-left: 5mm; } .contact { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #ccc; font: 9pt system-ui, sans-serif; white-space: pre-line; }
    </style></head><body>
      <p class="meta">${escape([pitch.genre, project.kind].filter(Boolean).join(' · '))}</p><h1>${escape(project.title)}</h1>
      ${pitch.logline ? `<p class="logline">${escape(pitch.logline)}</p>` : ''}
      ${project.synopsis ? `<h2>Synopsis</h2><p>${escape(project.synopsis)}</p>` : ''}
      ${characters.length ? `<h2>Key characters</h2><ul>${characters.map(item => `<li><strong>${escape(item.name)}</strong> — ${item.share}% of dialogue, ${item.scenes} scenes</li>`).join('')}</ul>` : ''}
      ${facts.length ? `<h2>At a glance</h2><dl>${facts.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>` : ''}
      ${comps.length ? `<h2>Comparable titles</h2><p>${comps.map(escape).join(' · ')}</p>` : ''}
      ${pitch.contact ? `<p class="contact">${escape(pitch.contact)}</p>` : ''}
    </body></html>`);
    page.document.close();
    page.focus();
    page.print();
  }

  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={760}>
    <Layout
      header={<DialogHeader title="Pitch one-sheet" subtitle="Built from your project. Edit the logline and comparisons, then print or save as PDF." onOpenChange={open => { if (!open) onClose(); }} />}
      content={<LayoutContent>
        <div className="pitch">
          <div className="pitch-fields">
            <label>Logline<textarea rows={3} value={pitch.logline} onChange={event => set('logline', event.target.value)} placeholder="When [inciting incident], a [protagonist] must [goal] before [stakes]." />
              <small className={pitch.logline.split(/\s+/).filter(Boolean).length > 45 ? 'is-warn' : undefined}>{pitch.logline.split(/\s+/).filter(Boolean).length} words — aim for 25–45</small></label>
            <label>Genre and tone<input value={pitch.genre} onChange={event => set('genre', event.target.value)} placeholder="Coastal crime drama" /></label>
            <label>Comparable titles<input value={pitch.comps} onChange={event => set('comps', event.target.value)} placeholder="Broadchurch, Happy Valley" /></label>
            <label>Contact<textarea rows={2} value={pitch.contact} onChange={event => set('contact', event.target.value)} placeholder="Name · email · agent or company" /></label>
          </div>
          <article className="pitch-preview" aria-label="One-sheet preview">
            <p className="pitch-meta">{[pitch.genre, project.kind].filter(Boolean).join(' · ')}</p>
            <h2>{project.title}</h2>
            {pitch.logline && <p className="pitch-logline">{pitch.logline}</p>}
            {characters.length > 0 && <><h3>Key characters</h3><ul>{characters.map(item => <li key={item.name}><strong>{item.name}</strong> — {item.share}% of dialogue, {item.scenes} scenes</li>)}</ul></>}
            {facts.length > 0 && <><h3>At a glance</h3><dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}
            {comps.length > 0 && <><h3>Comparable titles</h3><p>{comps.join(' · ')}</p></>}
          </article>
        </div>
      </LayoutContent>}
      footer={<LayoutFooter><div className="shell-dialog-actions">
        <Button label="Copy as text" variant="secondary" icon={<Copy size={15} aria-hidden="true" />} onClick={() => void navigator.clipboard?.writeText(text)} />
        <Button label="Print or save as PDF" variant="primary" icon={<Printer size={15} aria-hidden="true" />} onClick={print} />
      </div></LayoutFooter>}
    />
  </Dialog>;
}
