/**
 * Project pulse: where a project stands and what to do next, worked out on the device from the
 * project itself. Nothing is sent anywhere.
 */
import { checks, creatorModule } from './creator/model';
import type { DocumentModel, Project } from './model';
import { budgetTotals, getProductionPlan, orderedDays, scheduleConflicts } from './production/model';
import { formatIssues, words } from './writing/script-insights';

export type PulseTarget = 'write' | 'av' | 'production' | 'creator' | 'outline' | 'media';

export interface PulseTile { id: string; label: string; value: string; detail: string; tone?: 'good' | 'warn' | 'bad'; target?: PulseTarget; progress?: number }
/**
 * What a brief item puts at stake. A blocker stops a shoot day, a call sheet or a publish going out; a risk costs money,
 * time or quality if left; momentum moves the work forward; upkeep protects it.
 */
export type Impact = 'blocker' | 'risk' | 'momentum' | 'upkeep';

export interface PulseStep {
  id: string;
  tone: 'bad' | 'warn' | 'info';
  /** What needs doing, in one line. */
  text: string;
  action: string;
  target: PulseTarget;
  impact: Impact;
  /** The consequence of leaving it: why this earns a place in today's brief. */
  why: string;
  /** A realistic estimate of the time it takes, in minutes. */
  minutes: number;
  /** Days until the date it affects (a shoot day, a publish date); undefined when it has no date. */
  dueInDays?: number;
  /** Ranking score: impact weighted by urgency, with a nudge for quick wins. Higher comes first. */
  score: number;
}

export interface DailyBrief {
  /** The one thing to do first. */
  focus?: PulseStep;
  /** Everything else, in ranked order. */
  then: PulseStep[];
  /** One-line summary, e.g. "3 things need you · 1 blocker · about 35 minutes". */
  summary: string;
  minutes: number;
  blockers: number;
}

const DAY = 86_400_000;

const IMPACT_WEIGHT: Record<Impact, number> = { blocker: 100, risk: 60, momentum: 35, upkeep: 20 };

/** How much sooner matters: a date tomorrow doubles an item's weight, one this week lifts it by 60%. */
export function urgency(dueInDays?: number): number {
  if (dueInDays === undefined) return 1;
  if (dueInDays <= 1) return 2;
  if (dueInDays <= 7) return 1.6;
  if (dueInDays <= 30) return 1.25;
  return 1;
}

/** Impact × urgency, plus a small bonus for anything that takes five minutes or less. */
export function scoreStep(impact: Impact, minutes: number, dueInDays?: number): number {
  return Math.round(IMPACT_WEIGHT[impact] * urgency(dueInDays) + (minutes <= 5 ? 5 : 0));
}

type StepInput = Omit<PulseStep, 'score' | 'tone'>;
const TONE: Record<Impact, PulseStep['tone']> = { blocker: 'bad', risk: 'warn', momentum: 'info', upkeep: 'warn' };
function step(input: StepInput): PulseStep {
  return { ...input, tone: TONE[input.impact], score: scoreStep(input.impact, input.minutes, input.dueInDays) };
}

/** A shoot or publish date as it reads in a sentence: "Mon 18 Jan". */
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/** Days from today to a YYYY-MM-DD date, counting whole calendar days. */
function daysUntil(date: string, now: Date): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${now.toISOString().slice(0, 10)}T12:00:00Z`)) / DAY);
}

/** Turns the ranked steps into a brief: one focus, the rest in order, and how long it all takes. */
export function dailyBrief(steps: PulseStep[]): DailyBrief {
  const [focus, ...then] = steps;
  const minutes = steps.reduce((sum, item) => sum + item.minutes, 0);
  const blockers = steps.filter(item => item.impact === 'blocker').length;
  const time = minutes < 60 ? `about ${Math.max(5, Math.round(minutes / 5) * 5)} minutes` : `about ${Math.round(minutes / 30) / 2} hours`;
  const summary = !steps.length ? 'Nothing needs you today.'
    : `${steps.length} ${steps.length === 1 ? 'thing needs' : 'things need'} you${blockers ? ` · ${blockers} ${blockers === 1 ? 'blocker' : 'blockers'}` : ''} · ${time}`;
  return { focus, then, summary, minutes, blockers };
}

function goalToday(project: Project, now: Date): { daily: number; written: number } | undefined {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(`swdr-goal:${project.id}`) ?? 'null') as { daily?: number; days?: Record<string, { start: number; end: number }> } | null;
    if (!raw?.daily) return undefined;
    const day = raw.days?.[now.toISOString().slice(0, 10)];
    return { daily: raw.daily, written: day ? Math.max(0, day.end - day.start) : 0 };
  } catch {
    return undefined;
  }
}

function relative(date: string, now: Date): string {
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${now.toISOString().slice(0, 10)}T12:00:00Z`)) / DAY);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function projectPulse(project: Project, current: DocumentModel | undefined, now = new Date()): { tiles: PulseTile[]; steps: PulseStep[] } {
  const tiles: PulseTile[] = [];
  const steps: PulseStep[] = [];
  const scripts = project.documents.filter(item => item.kind !== 'av');
  const totalWords = project.documents.reduce((sum, item) => sum + (item.kind === 'av'
    ? item.avRows.reduce((rows, row) => rows + words(row.audio), 0)
    : item.blocks.reduce((blocks, block) => blocks + (block.kind === 'note' ? 0 : words(block.text)), 0)), 0);
  const scenes = scripts.reduce((sum, item) => sum + item.blocks.filter(block => block.kind === 'scene').length, 0);
  const goal = goalToday(project, now);
  const writeTarget: PulseTarget = current?.kind === 'av' ? 'av' : 'write';

  tiles.push({ id: 'words', label: 'Written', value: totalWords.toLocaleString(), detail: `words across ${project.documents.length} ${project.documents.length === 1 ? 'document' : 'documents'}${scenes ? ` · ${scenes} scenes` : ''}`, target: writeTarget });
  if (goal) {
    const share = Math.min(100, Math.round(goal.written / goal.daily * 100));
    tiles.push({ id: 'goal', label: "Today's goal", value: `${share}%`, detail: `${goal.written.toLocaleString()} of ${goal.daily.toLocaleString()} words`, tone: share >= 100 ? 'good' : undefined, progress: share, target: writeTarget });
    const left = goal.daily - goal.written;
    if (share < 100) steps.push(step({ id: 'goal', impact: 'momentum', text: `${left.toLocaleString()} words to today's goal.`, action: 'Keep writing', target: writeTarget,
      why: `You are ${share}% of the way there. Small daily pages compound into drafts.`, minutes: Math.max(5, Math.ceil(left / 10)), dueInDays: 0 }));
  }

  if (current && current.kind !== 'av') {
    const issues = formatIssues(current);
    const errors = issues.filter(item => item.severity === 'error').length;
    tiles.push({ id: 'format', label: 'Script health', value: errors ? `${errors} to fix` : 'Clean', detail: `${issues.length - errors} suggestions in ${current.title}`, tone: errors ? 'bad' : 'good', target: 'write' });
    const released = Boolean(getProductionPlan(project, current.id));
    if (errors) steps.push(step({ id: 'format', impact: released ? 'blocker' : 'risk', text: `${errors} formatting ${errors === 1 ? 'problem' : 'problems'} in “${current.title}”.`,
      action: 'Open Script tools → Checks', target: 'write', minutes: Math.min(30, errors * 2),
      why: released ? 'Production reads scenes, cast and pages from this script, so formatting errors flow into the breakdown and call sheets.'
        : 'Formatting errors carry into the PDF, the page count and every export.' }));
    if (!current.beats.length && current.blocks.length > 20) steps.push(step({ id: 'beats', impact: 'momentum', text: 'This script has no outline beats yet.', action: 'Open the outline', target: 'outline',
      why: 'A beat board makes structure problems visible while they are still cheap to fix.', minutes: 15 }));
  }

  const plan = current && getProductionPlan(project, current.id);
  if (plan) {
    const active = plan.scenes.filter(scene => scene.status === 'active');
    const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
    const done = active.filter(scene => scheduled.has(scene.id)).length;
    const share = active.length ? Math.round(done / active.length * 100) : 0;
    tiles.push({ id: 'schedule', label: 'Scheduled', value: `${share}%`, detail: `${done} of ${active.length} scenes on ${plan.days.length} shoot ${plan.days.length === 1 ? 'day' : 'days'}`, progress: share, tone: share === 100 ? 'good' : undefined, target: 'production' });
    const next = orderedDays(plan).find(day => day.date >= now.toISOString().slice(0, 10));
    const nextShoot = next ? daysUntil(next.date, now) : undefined;
    const clashes = scheduleConflicts(plan);
    if (clashes.length) {
      const dates = clashes.flatMap(conflict => conflict.stripIds.map(id => plan.days.find(day => day.id === plan.strips.find(strip => strip.id === id)?.dayId)?.date))
        .filter((date): date is string => Boolean(date) && date! >= now.toISOString().slice(0, 10)).sort();
      steps.push(step({ id: 'conflicts', impact: 'blocker', text: `${clashes.length} schedule ${clashes.length === 1 ? 'conflict' : 'conflicts'} — cast or locations double-booked or unavailable.`,
        action: 'Review the schedule', target: 'production', minutes: 10 * clashes.length, dueInDays: dates[0] ? daysUntil(dates[0], now) : nextShoot,
        why: dates[0] ? `The call sheet for ${dayLabel(dates[0])} cannot go out while someone is booked twice or unavailable.` : 'A call sheet cannot go out while someone is booked twice or unavailable.' }));
    }
    if (active.length - done > 0) steps.push(step({ id: 'unscheduled', impact: 'risk', text: `${active.length - done} ${active.length - done === 1 ? 'scene is' : 'scenes are'} not on the schedule yet.`,
      action: 'Open the stripboard', target: 'production', minutes: Math.min(30, 3 * (active.length - done)), dueInDays: nextShoot,
      why: 'A scene off the board has no day, no call time and no cast booked for it.' }));
    if (next) tiles.push({ id: 'shoot', label: 'Next shoot day', value: relative(next.date, now), detail: `${next.label || next.date} · call ${next.callTime}`, target: 'production' });
    const money = budgetTotals(plan);
    if (money.planned > 0) {
      const spent = Math.round(money.actual / money.planned * 100);
      tiles.push({ id: 'budget', label: 'Budget spent', value: `${spent}%`, detail: money.variance < 0 ? 'over the planned costs' : 'of planned costs', progress: Math.min(100, spent), tone: spent > 100 ? 'bad' : spent > 85 ? 'warn' : 'good', target: 'production' });
      if (spent > 100) steps.push(step({ id: 'budget', impact: 'risk', text: `Actual spend is ${spent - 100}% over the planned costs.`, action: 'Open the budget', target: 'production',
        why: 'Every further cost deepens the overspend. Agree cuts or reissue the top sheet before the next payment.', minutes: 15, dueInDays: nextShoot }));
      else if (spent > 85) steps.push(step({ id: 'budget', impact: 'risk', text: `${spent}% of the budget is spent.`, action: 'Open the budget', target: 'production',
        why: `Only ${100 - spent}% headroom remains${next ? ` with the next shoot day ${relative(next.date, now)}` : ''}.`, minutes: 10, dueInDays: nextShoot }));
    }
  }

  const creator = creatorModule(project).pieces;
  if (creator.length) {
    const live = creator.filter(item => item.status === 'published').length;
    const upcoming = creator.filter(item => item.publishDate && item.publishDate >= now.toISOString().slice(0, 10) && item.status !== 'published')
      .sort((a, b) => (a.publishDate ?? '').localeCompare(b.publishDate ?? ''));
    tiles.push({ id: 'videos', label: 'Videos', value: `${live} live`, detail: `${creator.length - live} in the pipeline`, target: 'creator' });
    if (upcoming[0]) tiles.push({ id: 'publish', label: 'Next publish', value: relative(upcoming[0].publishDate!, now), detail: upcoming[0].title || 'Untitled', target: 'creator' });
    for (const item of upcoming.slice(0, 3)) {
      const errors = checks(item).filter(check => check.level === 'error').length;
      const soon = Date.parse(`${item.publishDate}T12:00:00Z`) - now.getTime() < 7 * DAY;
      if (errors && soon) steps.push(step({ id: `piece-${item.id}`, impact: 'blocker', text: `“${item.title || 'Untitled'}” publishes ${relative(item.publishDate!, now)} with ${errors} ${errors === 1 ? 'problem' : 'problems'}.`,
        action: 'Open Creator studio', target: 'creator', minutes: 5 + 5 * errors, dueInDays: daysUntil(item.publishDate!, now),
        why: 'It goes live with failing platform or retention checks unless they are fixed first.' }));
    }
    const ideas = creator.filter(item => item.status === 'idea').length;
    if (!upcoming.length) steps.push(step({ id: 'cadence', impact: 'risk', text: 'Nothing is scheduled to publish.', action: 'Schedule a video', target: 'creator', minutes: 10,
      why: 'A steady cadence matters more than any single video, for the audience and for the algorithm.' }));
    else if (ideas >= 3) steps.push(step({ id: 'ideas', impact: 'momentum', text: `${ideas} ideas are waiting. Move the strongest one into scripting.`, action: 'Open the board', target: 'creator', minutes: 5,
      why: 'Ideas age. Committing to one now keeps the pipeline full behind the next publish date.' }));
  }

  // Projects live in this browser: remind people to keep a copy once there is real work in it.
  let backedUp: string | null = null;
  try { backedUp = globalThis.localStorage?.getItem(`swdr-backup:${project.id}`) ?? null; } catch { /* storage unavailable */ }
  const stale = !backedUp || now.getTime() - Date.parse(backedUp) > 14 * DAY;
  if (totalWords > 500 && stale) steps.push(step({ id: 'backup', impact: 'upkeep', text: backedUp ? 'Your last backup of this project is over two weeks old.' : 'This project has never been backed up outside this browser.',
    action: 'Export a project archive', target: writeTarget, minutes: 1,
    why: `${totalWords.toLocaleString()} words live only in this browser. Clearing site data would lose them.` }));

  const unused = project.assets.filter(asset => !JSON.stringify(project.modules).includes(asset.id)
    && !project.documents.some(item => JSON.stringify(item).includes(asset.id)));
  const bytes = project.assets.reduce((sum, asset) => sum + Math.round(asset.dataUrl.length * 0.75), 0);
  if (project.assets.length) tiles.push({ id: 'media', label: 'Files & media', value: String(project.assets.length), detail: `${(bytes / 1_048_576).toFixed(1)} MB${unused.length ? ` · ${unused.length} unused` : ''}`, target: 'media' });
  if (bytes > 40 * 1_048_576) steps.push(step({ id: 'storage', impact: 'upkeep', text: `Media takes ${(bytes / 1_048_576).toFixed(0)} MB of browser storage.`,
    action: 'Tidy files & media', target: 'media', minutes: 5, why: 'Browsers cap site storage; unused files take room from your scripts.' }));

  // Highest score first; ties go to the sooner date, then the quicker task.
  const ranked = steps.sort((a, b) => b.score - a.score || (a.dueInDays ?? Infinity) - (b.dueInDays ?? Infinity) || a.minutes - b.minutes);
  return { tiles, steps: ranked.slice(0, 6) };
}
