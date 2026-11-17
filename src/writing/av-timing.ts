import type { AVRow } from '../model';

export interface TimedAVRow extends AVRow {
  startSeconds: number;
  endSeconds: number;
  overlap: boolean;
}

function milliseconds(seconds?: number): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * 1000);
}

export function timedRows(rows: AVRow[]): { rows: TimedAVRow[]; durationSeconds: number; contentSeconds: number } {
  let playhead = 0;
  let content = 0;
  const timed = rows.map(row => {
    const duration = milliseconds(row.durationSeconds);
    const explicit = row.cueSeconds !== undefined && Number.isFinite(row.cueSeconds) && row.cueSeconds >= 0;
    const start = explicit ? milliseconds(row.cueSeconds) : playhead;
    const end = start + duration;
    const overlap = explicit && duration > 0 && start < playhead;
    playhead = Math.max(playhead, end);
    content += duration;
    return { ...row, startSeconds: start / 1000, endSeconds: end / 1000, overlap };
  });
  return { rows: timed, durationSeconds: playhead / 1000, contentSeconds: content / 1000 };
}

export function timingLabel(seconds: number): string {
  const value = milliseconds(seconds);
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value / 60_000) % 60;
  const remainder = Math.floor(value / 1000) % 60;
  const day = (hours > 0 ? [hours, minutes, remainder] : [minutes, remainder]).map(number => String(number).padStart(2, '0')).join(':');
  const thousandths = value % 1000;
  return thousandths ? day + '.' + String(thousandths).padStart(3, '0').replace(/0+$/, '') : day;
}
