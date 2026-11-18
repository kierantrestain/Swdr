import { Button } from '@astryxdesign/core/Button';
import { ArrowLeft, ArrowRight, Clapperboard, Crown, FileText, Rocket, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

const DONE = 'swdr-welcome-done';

export function welcomeSeen(): boolean {
  try { return localStorage.getItem(DONE) === '1'; } catch { return true; }
}

const STEPS: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: <Rocket size={22} aria-hidden="true" />, title: 'Welcome to SWDR', body: 'Write, plan, shoot and publish in one place — film, TV, stage, documentary, commercials and creator video. It works offline, and your projects stay on this device unless you share them.' },
  { icon: <FileText size={22} aria-hidden="true" />, title: 'Start a project', body: 'Choose New project for a blank script, Import script to bring in Final Draft, Celtx, Fade In, Fountain, Word or PDF, or Load demo projects to explore a finished series, documentary, commercial and creator channel.' },
  { icon: <Sparkles size={22} aria-hidden="true" />, title: 'Write without fiddling', body: 'Enter and Tab move between scene headings, action, characters and dialogue for you. Press Ctrl/⌘+K to jump anywhere or search every line, and open Script tools for reports, formatting checks, a voiced table read and writing goals.' },
  { icon: <Clapperboard size={22} aria-hidden="true" />, title: 'From page to shoot to post', body: 'Each project gets a breakdown, stripboard, call sheets, sides and a budget built from the script, plus Creator studio for Shorts, Reels, TikTok and YouTube. The Overview shows what needs doing next.' },
  { icon: <Crown size={22} aria-hidden="true" />, title: 'Collaborate and get help', body: 'Sign in to share a project and co-write live with cursors, and to use the AI partner for ideas, structure, drafts and notes. SWDR is free forever on your device; Pro is one payment, for life.' }
];

/** First-run tour: an inline card on Home that never blocks the page. */
export function Welcome({ onDone, onPlans }: { onDone: () => void; onPlans: () => void }) {
  const [step, setStep] = useState(0);
  const finish = () => { try { localStorage.setItem(DONE, '1'); } catch { /* shows again next time */ } onDone(); };
  const current = STEPS[step];
  return <section className="welcome" aria-label="Welcome tour">
    <span className="welcome-icon">{current.icon}</span>
    <div className="welcome-body">
      <small>Step {step + 1} of {STEPS.length}</small>
      <h2>{current.title}</h2>
      <p>{current.body}</p>
      <div className="welcome-actions">
        {step > 0 && <Button label="Back" size="sm" variant="ghost" icon={<ArrowLeft size={14} aria-hidden="true" />} onClick={() => setStep(step - 1)} />}
        {step < STEPS.length - 1
          ? <Button label="Next" size="sm" variant="primary" endContent={<ArrowRight size={14} aria-hidden="true" />} onClick={() => setStep(step + 1)} />
          : <><Button label="Start writing" size="sm" variant="primary" onClick={finish} /><Button label="See plans" size="sm" variant="secondary" onClick={onPlans} /></>}
        <span className="welcome-dots" aria-hidden="true">{STEPS.map((_, index) => <i key={index} className={index === step ? 'is-on' : undefined} />)}</span>
      </div>
    </div>
    <button type="button" className="welcome-close" aria-label="Skip the tour" onClick={finish}><X size={16} /></button>
  </section>;
}
