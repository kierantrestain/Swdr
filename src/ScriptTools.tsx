import { BookOpenCheck, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sceneList, sourceFor } from './model';
import type { WorkspaceViewProps } from './model';

export function ScriptTools({ project, document, onOpenSource, onStatus }: Pick<WorkspaceViewProps, 'project' | 'document' | 'onOpenSource' | 'onStatus'>) {
  const [open, setOpen] = useState(false);
  return <details className="script-tools" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><BookOpenCheck size={15} /> Script tools</summary>
    {open && <ScriptToolsPanel project={project} document={document} onOpenSource={onOpenSource} onStatus={onStatus} />}
  </details>;
}

function ScriptToolsPanel({ project, document, onOpenSource, onStatus }: Pick<WorkspaceViewProps, 'project' | 'document' | 'onOpenSource' | 'onStatus'>) {
  const activeSpeech = useRef(false);
  const [reading, setReading] = useState(false);
  const scenes = sceneList(document);
  const issues = scenes.filter(scene => !scene.heading.trim());
  const duplicateNumbers = new Map<string, number>();
  for (const scene of scenes) duplicateNumbers.set(scene.number, (duplicateNumbers.get(scene.number) ?? 0) + 1);
  const duplicates = [...duplicateNumbers].filter(([, count]) => count > 1).map(([number]) => number);
  const missingDialogues = document.blocks.filter((block, index) => {
    if (block.kind !== 'character') return false;
    const next = document.blocks[index + 1];
    return next?.kind === 'parenthetical'
      ? document.blocks[index + 2]?.kind !== 'dialogue' || !document.blocks[index + 2].text.trim()
      : next?.kind !== 'dialogue' || !next.text.trim();
  });

  useEffect(() => () => {
    if (!activeSpeech.current) return;
    activeSpeech.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  function stopRead() {
    activeSpeech.current = false;
    window.speechSynthesis?.cancel();
    setReading(false);
  }

  function readAloud() {
    const speech = window.speechSynthesis;
    const voices = speech?.getVoices().filter(voice => voice.localService) ?? [];
    const voice = voices.find(item => item.lang === 'en-GB') ?? voices.find(item => item.lang.startsWith('en')) ?? voices[0];
    if (!speech || !voice) { onStatus('An on-device reading voice is unavailable in this browser.'); return; }
    const blocks = document.blocks.filter(block => block.kind !== 'note' && block.text.trim());
    if (!blocks.length) { onStatus('Add manuscript text to start a table read.'); return; }
    activeSpeech.current = true;
    setReading(true);
    function advance(index: number) {
      if (!activeSpeech.current) return;
      const block = blocks[index];
      if (!block) { stopRead(); return; }
      const utterance = new SpeechSynthesisUtterance(block.text);
      utterance.voice = voice;
      utterance.rate = 0.96;
      utterance.onend = () => advance(index + 1);
      utterance.onerror = () => { if (activeSpeech.current) stopRead(); };
      speech.speak(utterance);
    }
    advance(0);
  }

  return <div className="script-tools-panel">
      <h3>Script health</h3>
      {!(issues.length || duplicates.length || missingDialogues.length) && <p>Scene headings and dialogue cues are complete.</p>}
      {duplicates.length > 0 && <p>Repeated scene numbers {duplicates.join(', ')}</p>}
      {issues.map(scene => <button className="quiet" key={scene.id} onClick={() => onOpenSource(sourceFor(project, document, { sceneId: scene.id, blockId: scene.blockId }))}>Empty scene heading {scene.number}</button>)}
      {missingDialogues.slice(0, 8).map(block => <button className="quiet" key={block.id} onClick={() => onOpenSource(sourceFor(project, document, { blockId: block.id }))}>Incomplete dialogue for {block.text || 'an unnamed character'}</button>)}
      <h3>Table read</h3>
      {reading ? <button onClick={stopRead}><Square size={14} /> Stop reading</button> : <button onClick={readAloud}><Play size={14} /> Read this draft</button>}
  </div>;
}
