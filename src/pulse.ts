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
export interface PulseStep { id: string; tone: 'bad' | 'warn' | 'info'; text: string; action: string; target: PulseTarget }

const DAY = 86_400_000;

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
    if (share < 100) steps.push({ id: 'goal', tone: 'info', text: `${(goal.daily - goal.written).toLocaleString()} words to today's goal.`, action: 'Keep writing', target: writeTarget });
  }

  if (current && current.kind !== 'av') {
    const issues = formatIssues(current);
    const errors = issues.filter(item => item.severity === 'error').length;
    tiles.push({ id: 'format', label: 'Script health', value: errors ? `${errors} to fix` : 'Clean', detail: `${issues.length - errors} suggestions in ${current.title}`, tone: errors ? 'bad' : 'good', target: 'write' });
    if (errors) steps.push({ id: 'format', tone: 'bad', text: `${errors} formatting ${errors === 1 ? 'problem' : 'problems'} in “${current.title}”.`, action: 'Open Script tools → Checks', target: 'write' });
    if (!current.beats.length && current.blocks.length > 20) steps.push({ id: 'beats', tone: 'info', text: 'This script has no outline beats yet. A beat board makes structure problems visible early.', action: 'Open the outline', target: 'outline' });
  }

  const plan = current && getProductionPlan(project, current.id);
  if (plan) {
    const active = plan.scenes.filter(scene => scene.status === 'active');
    const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
    const done = active.filter(scene => scheduled.has(scene.id)).length;
    const share = active.length ? Math.round(done / active.length * 100) : 0;
    tiles.push({ id: 'schedule', label: 'Scheduled', value: `${share}%`, detail: `${done} of ${active.length} scenes on ${plan.days.length} shoot ${plan.days.length === 1 ? 'day' : 'days'}`, progress: share, tone: share === 100 ? 'good' : undefined, target: 'production' });
    const conflicts = scheduleConflicts(plan).length;
    if (conflicts) steps.push({ id: 'conflicts', tone: 'bad', text: `${conflicts} schedule ${conflicts === 1 ? 'conflict' : 'conflicts'} — cast or locations double-booked or unavailable.`, action: 'Review the schedule', target: 'production' });
    if (active.length - done > 0) steps.push({ id: 'unscheduled', tone: 'warn', text: `${active.length - done} ${active.length - done === 1 ? 'scene is' : 'scenes are'} not on the schedule yet.`, action: 'Open the stripboard', target: 'production' });
    const next = orderedDays(plan).find(day => day.date >= now.toISOString().slice(0, 10));
    if (next) tiles.push({ id: 'shoot', label: 'Next shoot day', value: relative(next.date, now), detail: `${next.label || next.date} · call ${next.callTime}`, target: 'production' });
    const money = budgetTotals(plan);
    if (money.planned > 0) {
      const spent = Math.round(money.actual / money.planned * 100);
      tiles.push({ id: 'budget', label: 'Budget spent', value: `${spent}%`, detail: money.variance < 0 ? 'over the planned costs' : 'of planned costs', progress: Math.min(100, spent), tone: spent > 100 ? 'bad' : spent > 85 ? 'warn' : 'good', target: 'production' });
      if (spent > 100) steps.push({ id: 'budget', tone: 'bad', text: `Actual spend is ${spent - 100}% over the planned costs.`, action: 'Open the budget', target: 'production' });
      else if (spent > 85) steps.push({ id: 'budget', tone: 'warn', text: `${spent}% of the budget is spent.`, action: 'Open the budget', target: 'production' });
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
      if (errors && soon) steps.push({ id: `piece-${item.id}`, tone: 'bad', text: `“${item.title || 'Untitled'}” publishes ${relative(item.publishDate!, now)} with ${errors} ${errors === 1 ? 'problem' : 'problems'}.`, action: 'Open Creator studio', target: 'creator' });
    }
    const ideas = creator.filter(item => item.status === 'idea').length;
    if (!upcoming.length) steps.push({ id: 'cadence', tone: 'warn', text: 'Nothing is scheduled to publish. A steady cadence matters more than any single video.', action: 'Schedule a video', target: 'creator' });
    else if (ideas >= 3) steps.push({ id: 'ideas', tone: 'info', text: `${ideas} ideas are waiting. Move the strongest one into scripting.`, action: 'Open the board', target: 'creator' });
  }

  const unused = project.assets.filter(asset => !JSON.stringify(project.modules).includes(asset.id)
    && !project.documents.some(item => JSON.stringify(item).includes(asset.id)));
  const bytes = project.assets.reduce((sum, asset) => sum + Math.round(asset.dataUrl.length * 0.75), 0);
  if (project.assets.length) tiles.push({ id: 'media', label: 'Files & media', value: String(project.assets.length), detail: `${(bytes / 1_048_576).toFixed(1)} MB${unused.length ? ` · ${unused.length} unused` : ''}`, target: 'media' });
  if (bytes > 40 * 1_048_576) steps.push({ id: 'storage', tone: 'warn', text: `Media takes ${(bytes / 1_048_576).toFixed(0)} MB of browser storage.`, action: 'Tidy files & media', target: 'media' });

  const order = { bad: 0, warn: 1, info: 2 };
  return { tiles, steps: steps.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6) };
}
