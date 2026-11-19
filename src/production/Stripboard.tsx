import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Item } from '@astryxdesign/core/Item';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TimeInput } from '@astryxdesign/core/TimeInput';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { VStack } from '@astryxdesign/core/VStack';
import { createISOTimeString } from '@astryxdesign/core/utils';
import type { ISODateString } from '@astryxdesign/core/utils';
import { AlertTriangle, ArrowRightLeft, CalendarDays, GripVertical, Plus, Rows3, Table2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import type { DragEvent, FormEvent, KeyboardEvent } from 'react';
import { newId } from '../model';
import { Choice, Count, Dialog, Empty, FormError, Glyph, Pane, SourceButton, Split, displayDate } from './components';
import type { PaneProps } from './components';
import {
  castNumbers, dayStrips, eighthsLabel, estimateEighths, isShootDate, minutesAfterMidnight, orderedDays, placeStrip,
  sceneCast, sceneSetting, scheduleConflicts, scriptTargets
} from './model';
import type { ProductionScene, ShootDay, Strip } from './model';
import { ScriptChangeBadge, ScriptChangeBanner, ScriptChangeDialog } from './ScriptChanges';
import { DayScenePicker, offeredScenes } from './DayScenePicker';
import { PersonAvatar } from './media';
import { ActionMenu, CastIds, StripLegend, toneStyle } from './StripParts';
import type { MenuAction } from './StripParts';

type Edit = { type: 'day'; detail?: ShootDay } | { type: 'strip'; dayId: string; detail?: Strip } | { type: 'unit' };
type View = 'Strips' | 'Table' | 'Calendar';
type DragItem = { stripId?: string; sceneId: string };
type DropTarget = { dayId: string | null; index: number };
type Draft = Record<string, string>;
interface StripRow extends Record<string, unknown> { id: string; strip: Strip; scene: ProductionScene }

const VIEWS: Array<{ name: View; icon: typeof Rows3 }> = [
  { name: 'Strips', icon: Rows3 }, { name: 'Table', icon: Table2 }, { name: 'Calendar', icon: CalendarDays }
];

/** Values for Astryx date and time fields: a stored shoot date is already YYYY-MM-DD, and times are validated on the way in. */
/** Fixed strip columns keep their width so every strip lines up; only the scene column flexes. */
const FIXED = { flex: 'none' } as const;
const isoDate = (value?: string) => value && isShootDate(value) ? value as ISODateString : undefined;
const isoTime = (value?: string) => (value && createISOTimeString(value)) || undefined;

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function Stripboard(pane: PaneProps) {
  const { project, plan, snapshot, source, readOnly, update, onOpenSource, changes, reviewScript } = pane;
  const [unitFilter, setUnitFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [castFilter, setCastFilter] = useState('');
  const [view, setView] = useState<View>('Strips');
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [edit, setEdit] = useState<Edit>();
  const [draft, setDraft] = useState<Draft>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [drag, setDrag] = useState<DragItem>();
  const [drop, setDrop] = useState<DropTarget>();
  const [changeFocus, setChangeFocus] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [focusGrip, setFocusGrip] = useState<string>();
  const hintId = useId();
  const days = orderedDays(plan);
  const visibleDays = days.filter(day => !unitFilter || day.unitId === unitFilter);
  const scenes = plan.scenes.filter(scene => scene.status === 'active');
  const scheduled = new Set(plan.strips.map(strip => strip.sceneId));
  const unscheduled = scenes.filter(scene => !scheduled.has(scene.id));
  const conflicts = scheduleConflicts(plan);
  const conflictedStrips = new Set(conflicts.flatMap(conflict => conflict.stripIds));
  const castIds = castNumbers(plan);
  const changeById = new Map(changes.map(change => [change.sceneId, change]));
  const castPeople = plan.people.filter(person => person.type === 'Cast');
  const script = useMemo(() => new Map(scriptTargets(project, snapshot.document).map(target => [target.id, {
    eighths: estimateEighths(target.blocks),
    synopsis: target.blocks.find(block => block.kind === 'action' && block.text.trim())?.text.trim() ?? ''
  }])), [project, snapshot]);
  const scriptFor = (scene: ProductionScene) => {
    const found = script.get(scene.source.sceneId ?? scene.source.shotId ?? '');
    return found ? { ...found, eighths: scene.eighths ?? found.eighths } : scene.eighths ? { eighths: scene.eighths, synopsis: '' } : undefined;
  };
  const dayNumber = (dayId: string) => days.findIndex(day => day.id === dayId) + 1;
  const unitName = (unitId: string) => plan.units.find(unit => unit.id === unitId)?.name ?? '';
  const locationName = (id?: string) => plan.locations.find(location => location.id === id)?.name ?? '';
  const matches = (strip: Strip) => (!locationFilter || locationFilter === strip.locationId) &&
    (!castFilter || sceneCast(plan, strip.sceneId).some(person => person.id === castFilter));

  useEffect(() => {
    if (!focusGrip) return;
    document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(focusGrip)}"]`)?.focus();
    setFocusGrip(undefined);
  }, [focusGrip, plan]);

  function open(next: Edit) {
    setError('');
    setEdit(next);
    if (next.type === 'unit') setDraft({ name: '' });
    if (next.type === 'day') {
      const day = next.detail;
      setDraft({
        label: day?.label ?? '', date: day?.date ?? '', unit: day?.unitId || unitFilter || plan.units[0]?.id || '', call: day?.callTime ?? '08:00',
        notes: day?.notes ?? '', weather: day?.weather ?? '', hospital: day?.hospital ?? '', parking: day?.parking ?? ''
      });
      setChosen(offeredScenes(plan, scenes, day?.id).onDay);
    }
    if (next.type === 'strip') {
      const strip = next.detail;
      const scene = scenes.find(item => item.id === (strip?.sceneId ?? unscheduled[0]?.id ?? scenes[0]?.id));
      setDraft({
        scene: scene?.id ?? '', day: next.dayId, location: strip?.locationId ?? '', start: strip?.startTime ?? '09:00',
        minutes: String(strip?.minutes ?? 30), eighths: String(strip?.eighths ?? (scene ? scriptFor(scene)?.eighths ?? 1 : 1))
      });
    }
  }
  const text = (key: string) => (draft[key] ?? '').trim();

  function move(item: DragItem, dayId: string | null, index: number, message: string) {
    if (readOnly) return;
    const scene = plan.scenes.find(candidate => candidate.id === item.sceneId);
    const eighths = scene ? scriptFor(scene)?.eighths ?? 1 : 1;
    if (update(current => placeStrip(current, item, dayId, index, eighths), message)) {
      setAnnouncement(message);
      if (item.stripId && dayId) setFocusGrip(item.stripId);
    }
  }

  function step(strip: Strip, scene: ProductionScene, delta: -1 | 1) {
    const list = dayStrips(plan, strip.dayId);
    const position = list.findIndex(item => item.id === strip.id);
    const target = position + delta;
    const item = { stripId: strip.id, sceneId: scene.id };
    if (target >= 0 && target < list.length) {
      return move(item, strip.dayId, target, `Scene ${scene.number} moved to slot ${target + 1} on day ${dayNumber(strip.dayId)}.`);
    }
    const dayIndex = visibleDays.findIndex(day => day.id === strip.dayId);
    const next = visibleDays[dayIndex + delta];
    if (!next) return setAnnouncement(`Scene ${scene.number} is already at the ${delta < 0 ? 'start' : 'end'} of the schedule.`);
    move(item, next.id, delta < 0 ? dayStrips(plan, next.id).length : 0, `Scene ${scene.number} moved to day ${dayNumber(next.id)}.`);
  }

  function moveActions(strip: Strip, scene: ProductionScene): MenuAction[] {
    const list = dayStrips(plan, strip.dayId);
    const position = list.findIndex(item => item.id === strip.id);
    const item = { stripId: strip.id, sceneId: scene.id };
    return [
      { label: 'Move earlier', onSelect: () => step(strip, scene, -1), disabled: position === 0 && visibleDays[0]?.id === strip.dayId },
      { label: 'Move later', onSelect: () => step(strip, scene, 1), disabled: position === list.length - 1 && visibleDays.at(-1)?.id === strip.dayId },
      ...visibleDays.filter(day => day.id !== strip.dayId).map(day => ({
        label: `Move to day ${dayNumber(day.id)} · ${day.label}`,
        onSelect: () => move(item, day.id, dayStrips(plan, day.id).length, `Scene ${scene.number} moved to day ${dayNumber(day.id)}.`)
      })),
      { label: 'Return to unscheduled', onSelect: () => move(item, null, 0, `Scene ${scene.number} returned to unscheduled.`) }
    ];
  }

  function gripKeys(event: KeyboardEvent<HTMLButtonElement>, strip: Strip, scene: ProductionScene) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    step(strip, scene, event.key === 'ArrowUp' ? -1 : 1);
  }

  function dragProps(item: DragItem) {
    if (readOnly) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.stripId ?? item.sceneId);
        setDrag(item);
      },
      onDragEnd: () => { setDrag(undefined); setDrop(undefined); }
    };
  }

  function target(next: DropTarget) {
    setDrop(current => current?.dayId === next.dayId && current.index === next.index ? current : next);
  }

  function overStrip(event: DragEvent<HTMLElement>, dayId: string, strip: Strip) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const others = dayStrips(plan, dayId).filter(item => item.id !== drag.stripId);
    const index = others.findIndex(item => item.id === strip.id);
    const box = event.currentTarget.getBoundingClientRect();
    target({ dayId, index: index < 0 ? others.length : index + (event.clientY > box.top + box.height / 2 ? 1 : 0) });
  }

  function overDay(event: DragEvent<HTMLElement>, dayId: string) {
    if (!drag) return;
    event.preventDefault();
    target({ dayId, index: dayStrips(plan, dayId).filter(item => item.id !== drag.stripId).length });
  }

  function dropOn(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const item = drag;
    const place = drop;
    setDrag(undefined);
    setDrop(undefined);
    if (!item || !place) return;
    const scene = plan.scenes.find(candidate => candidate.id === item.sceneId);
    const label = scene ? `Scene ${scene.number}` : 'Scene';
    move(item, place.dayId, place.index, place.dayId ? `${label} scheduled on day ${dayNumber(place.dayId)}.` : `${label} returned to unscheduled.`);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!edit || readOnly) return;
    if (edit.type === 'unit') {
      const name = text('name');
      if (!name) return setError('Enter a unit name.');
      if (plan.units.some(unit => unit.name.toLowerCase() === name.toLowerCase())) return setError('Use a distinct unit name.');
      const unit = { id: newId(), name, source };
      if (update(current => ({ ...current, units: [...current.units, unit] }), 'Unit added.')) setEdit(undefined);
      return;
    }
    if (edit.type === 'day') {
      const date = text('date');
      const label = text('label');
      const unitId = text('unit');
      const callTime = text('call');
      const id = edit.detail?.id ?? newId();
      if (!label || !unitId || !isShootDate(date) || !Number.isFinite(minutesAfterMidnight(callTime))) {
        return setError('Enter a label, unit, calendar date and call time.');
      }
      if (plan.days.some(day => day.date === date && day.unitId === unitId && day.id !== id)) {
        return setError('This unit already has a shoot day on that date.');
      }
      const day: ShootDay = {
        id, date, label, unitId, callTime, notes: text('notes'), source,
        weather: text('weather') || undefined, hospital: text('hospital') || undefined, parking: text('parking') || undefined
      };
      const offered = offeredScenes(plan, scenes, edit.detail?.id).offered.length > 0;
      if (update(current => {
        let next = { ...current, days: edit.detail ? current.days.map(item => item.id === id ? day : item) : [...current.days, day] };
        if (!offered) return next;
        for (const strip of dayStrips(next, id).filter(item => !chosen.has(item.sceneId))) {
          next = placeStrip(next, { stripId: strip.id, sceneId: strip.sceneId }, null, 0);
        }
        const already = new Set(dayStrips(next, id).map(strip => strip.sceneId));
        for (const scene of scenes.filter(item => chosen.has(item.id) && !already.has(item.id))) {
          const existing = next.strips.find(strip => strip.sceneId === scene.id);
          next = placeStrip(next, { stripId: existing?.id, sceneId: scene.id }, id, dayStrips(next, id).length, scriptFor(scene)?.eighths ?? 1);
        }
        return next;
      }, chosen.size ? `Shoot day saved with ${chosen.size} ${chosen.size === 1 ? 'scene' : 'scenes'}.` : 'Shoot day saved.')) setEdit(undefined);
      return;
    }
    const selected = scenes.find(scene => scene.id === text('scene'));
    const dayId = text('day');
    const id = edit.detail?.id ?? newId();
    const startTime = text('start');
    const minutes = Number(text('minutes'));
    const eighths = Number(text('eighths'));
    if (!selected || !plan.days.some(day => day.id === dayId)) return setError('Choose a scene and shoot day.');
    if (!Number.isInteger(minutes) || minutes < 1 || !Number.isInteger(eighths) || eighths < 0 ||
        !Number.isFinite(minutesAfterMidnight(startTime)) || minutesAfterMidnight(startTime) + minutes > 1440) {
      return setError('Set a valid start, duration and whole number of page eighths.');
    }
    const strip: Strip = {
      id, sceneId: selected.id, dayId, startTime, minutes, eighths, locationId: text('location') || undefined, source: selected.source
    };
    if (update(current => ({
      ...current,
      strips: edit.detail ? current.strips.map(item => item.id === id ? strip : item) : [...current.strips, strip]
    }), 'Schedule saved.')) setEdit(undefined);
  }


  /** The columns every strip shares, so strips line up down the board like printed strips. */
  function stripCells(scene: ProductionScene, eighths: number, location: string, compact = false) {
    const setting = sceneSetting(scene.heading);
    const synopsis = scriptFor(scene)?.synopsis;
    return <>
      <VStack width={32} style={FIXED}><Text weight="bold" hasTabularNumbers>{scene.number}</Text></VStack>
      {!compact && <VStack width={36} style={FIXED}><Text type="label">{setting.interior || '—'}</Text></VStack>}
      <VStack gap={0} hAlign="start" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <SourceButton source={scene.source} onOpenSource={onOpenSource}>{setting.set || 'Untitled scene'}</SourceButton>
        <Text type="supporting" color="secondary" maxLines={1} style={{ maxWidth: '100%' }}>{(compact ? [[setting.interior, setting.time].filter(Boolean).join(' '), synopsis] : [location, synopsis])
          .filter(Boolean).join(' · ') || 'No location assigned'}</Text>
      </VStack>
      {!compact && <VStack width={56} style={FIXED}><Text type="label">{setting.time || '—'}</Text></VStack>}
      <VStack width={48} hAlign="end" style={FIXED}><Text weight="semibold" hasTabularNumbers aria-label={`${eighthsLabel(eighths)} pages`}>{eighthsLabel(eighths)}</Text></VStack>
      {!compact && <VStack width={88} style={FIXED}><CastIds cast={sceneCast(plan, scene.id)} ids={castIds} /></VStack>}
    </>;
  }

  /** A strip's paint: its interior/exterior and day/night colour, plus conflict, drag and drop-target states. */
  function stripStyle(scene: ProductionScene, state: { conflict?: boolean; dragging?: boolean; dropBefore?: boolean }) {
    return {
      ...toneStyle(sceneSetting(scene.heading).tone),
      listStyle: 'none',
      outline: state.conflict ? 'var(--border-width) solid var(--color-warning)' : undefined,
      outlineOffset: state.conflict ? 'calc(var(--border-width) * -1)' : undefined,
      opacity: state.dragging ? 0.45 : undefined,
      boxShadow: state.dropBefore ? 'inset 0 var(--spacing-0-5) 0 var(--color-accent)' : undefined,
      cursor: readOnly ? undefined : 'grab'
    };
  }

  function scheduledStrip(strip: Strip, day: ShootDay, all: Strip[]) {
    const scene = scenes.find(item => item.id === strip.sceneId)!;
    const change = changeById.get(scene.id);
    const others = drag ? all.filter(item => item.id !== drag.stripId) : all;
    const dropBefore = drop?.dayId === day.id && others[drop.index]?.id === strip.id && drag?.stripId !== strip.id;
    const conflict = conflictedStrips.has(strip.id);
    return <HStack as="li" key={strip.id} gap={2} align="center" paddingInline={2} paddingBlock={2}
      style={stripStyle(scene, { conflict, dragging: drag?.stripId === strip.id, dropBefore })}
      {...dragProps({ stripId: strip.id, sceneId: scene.id })}
      onDragOver={event => overStrip(event, day.id, strip)} aria-label={`Scene ${scene.number}, ${scene.heading || 'untitled'}, ${strip.startTime}`}>
      {!readOnly
        ? <IconButton size="sm" variant="ghost" label={`Reorder scene ${scene.number}`} icon={<Glyph icon={GripVertical} />} data-grip={strip.id}
          aria-describedby={hintId} onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => gripKeys(event, strip, scene)} />
        : <VStack width={28} style={FIXED} />}
      {stripCells(scene, strip.eighths, locationName(strip.locationId ?? scene.locationId))}
      <VStack width={64} gap={0} style={FIXED}><Text weight="semibold" hasTabularNumbers>{strip.startTime}</Text><Text type="supporting" color="secondary">{strip.minutes} min</Text></VStack>
      <VStack width={140} gap={1} hAlign="start" style={FIXED}>
        {conflict && <Tooltip content="Review the schedule conflict for this scene"><Badge variant="warning" icon={<Glyph icon={AlertTriangle} size="xsm" />} label="Conflict" /></Tooltip>}
        {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(change.sceneId)} />}
      </VStack>
      {!readOnly && <HStack gap={1} align="center">
        <Link label={`Edit scheduled scene ${scene.number}`} onClick={() => open({ type: 'strip', dayId: day.id, detail: strip })}>Edit</Link>
        <ActionMenu label={`Move scene ${scene.number}`} actions={moveActions(strip, scene)} />
      </HStack>}
    </HStack>;
  }

  /** The day's header band: number, label, date, unit, call and estimated wrap. */
  function dayBand(day: ShootDay, detail: string) {
    return <HStack gap={3} justify="between" align="center" wrap="wrap" paddingInline={4} paddingBlock={3}
      style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
      <Heading level={3} color="inherit">Day {dayNumber(day.id)} · {day.label}</Heading>
      <Text color="inherit">{detail}</Text>
    </HStack>;
  }

  function stripDay(day: ShootDay) {
    const all = dayStrips(plan, day.id);
    const strips = all.filter(matches);
    const eighths = strips.reduce((sum, strip) => sum + strip.eighths, 0);
    const last = all.at(-1);
    const wrap = last ? minutesAfterMidnight(last.startTime) + last.minutes : NaN;
    const dropEnd = drop?.dayId === day.id && drop.index >= all.filter(item => item.id !== drag?.stripId).length;
    return <Card key={day.id} padding={0} role="region" aria-label={`Day ${dayNumber(day.id)} · ${day.label}`} style={{ overflow: 'hidden' }}>
      {dayBand(day, `${displayDate(day.date)} · ${unitName(day.unitId)} · Call ${day.callTime}${Number.isFinite(wrap) ? ` · Wrap est. ${clock(wrap)}` : ''}`)}
      <VStack as="ol" gap={0} onDragOver={event => overDay(event, day.id)} onDrop={dropOn}
        style={{ margin: 0, padding: 0, minHeight: 'var(--size-element-lg, 3rem)', boxShadow: dropEnd ? 'inset 0 calc(var(--spacing-0-5) * -1) 0 var(--color-accent)' : undefined }}>
        {strips.flatMap((strip, index) => {
          const previous = strips[index - 1];
          const moveTo = previous?.locationId && strip.locationId && previous.locationId !== strip.locationId ? locationName(strip.locationId) : '';
          return [
            ...(moveTo ? [<HStack as="li" key={`${strip.id}-move`} gap={2} align="center" paddingInline={4} paddingBlock={1}
              style={{ listStyle: 'none', background: 'var(--color-background-muted)' }}>
              <Glyph icon={ArrowRightLeft} size="xsm" color="secondary" /><Text type="supporting" weight="semibold">Company move to {moveTo}</Text>
            </HStack>] : []),
            scheduledStrip(strip, day, all)
          ];
        })}
        {strips.length === 0 && <HStack as="li" paddingInline={4} paddingBlock={3} style={{ listStyle: 'none' }}>
          <Text color="secondary">{all.length ? 'No scenes match these filters.' : readOnly ? 'No scenes scheduled for this day.' : 'Drag a scene here, or use Schedule scene.'}</Text>
        </HStack>}
      </VStack>
      <HStack gap={3} justify="between" align="center" wrap="wrap" paddingInline={4} paddingBlock={2} style={{ background: 'var(--color-background-muted)' }}>
        <Text type="supporting" weight="semibold">End of day {dayNumber(day.id)} · {strips.length} {strips.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(eighths)} pages</Text>
        {!readOnly && <HStack gap={3}>
          <Link onClick={() => open({ type: 'strip', dayId: day.id })}><Glyph icon={Plus} size="xsm" /> Schedule scene</Link>
          <Link onClick={() => open({ type: 'day', detail: day })}>Edit day</Link>
        </HStack>}
      </HStack>
    </Card>;
  }

  function poolStrip(scene: ProductionScene) {
    const eighths = scriptFor(scene)?.eighths ?? 1;
    const change = changeById.get(scene.id);
    return <HStack as="li" key={scene.id} gap={2} align="center" paddingInline={2} paddingBlock={2}
      style={{ ...stripStyle(scene, { dragging: drag?.sceneId === scene.id && !drag.stripId }), borderRadius: 'var(--radius-element)' }}
      {...dragProps({ sceneId: scene.id })} aria-label={`Unscheduled scene ${scene.number}, ${scene.heading || 'untitled'}`}>
      <Glyph icon={GripVertical} color="secondary" />
      {stripCells(scene, eighths, '', true)}
      {!readOnly && visibleDays.length > 0 && <ActionMenu label={`Schedule scene ${scene.number}`} actions={visibleDays.map(day => ({
        label: `Add to day ${dayNumber(day.id)} · ${day.label}`,
        onSelect: () => move({ sceneId: scene.id }, day.id, dayStrips(plan, day.id).length, `Scene ${scene.number} scheduled on day ${dayNumber(day.id)}.`)
      }))} />}
      {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(scene.id)} />}
    </HStack>;
  }

  const totalEighths = plan.strips.filter(strip => scenes.some(scene => scene.id === strip.sceneId)).reduce((sum, strip) => sum + strip.eighths, 0);
  const field = (key: string) => ({ value: draft[key] ?? '', onChange: (value: string) => setDraft(current => ({ ...current, [key]: value })) });
  const dayOptions = days.map(day => ({ value: day.id, label: `${day.date} · ${unitName(day.unitId)} · ${day.label}` }));

  const boneyard = <Card role="complementary" aria-label="Unscheduled scenes" variant={drop?.dayId === null ? 'blue' : 'muted'} padding={4}
    onDragOver={event => { if (drag?.stripId) { event.preventDefault(); target({ dayId: null, index: 0 }); } }} onDrop={dropOn}>
    <VStack gap={4}>
      <HStack gap={2} align="center"><Heading level={3}>Unscheduled</Heading><Count value={unscheduled.length} /></HStack>
      {unscheduled.length === 0
        ? <Text color="secondary">Every active scene is on the schedule.{!readOnly && ' Drag a strip here to take it off.'}</Text>
        : <VStack as="ol" gap={2} style={{ margin: 0, padding: 0 }}>{unscheduled.map(poolStrip)}</VStack>}
      {castPeople.length > 0 && <VStack gap={2}>
        <Divider />
        <Heading level={3}>Cast IDs</Heading>
        {castPeople.map(person => <Item key={person.id} label={person.name} description={person.role || undefined}
          startContent={<HStack gap={2} align="center"><Badge label={String(castIds.get(person.id))} /><PersonAvatar project={project} person={person} size={32} decorative /></HStack>} />)}
      </VStack>}
    </VStack>
  </Card>;

  return <VStack gap={4}>
    <HStack gap={3} justify="between" align="center" wrap="wrap">
      <HStack gap={2} wrap="wrap">
        <Choice label="Filter by unit" isLabelHidden width={170} value={unitFilter} onChange={setUnitFilter}
          options={[{ value: '', label: 'All units' }, ...plan.units.map(unit => ({ value: unit.id, label: unit.name }))]} />
        <Choice label="Filter by location" isLabelHidden width={200} value={locationFilter} onChange={setLocationFilter}
          options={[{ value: '', label: 'All locations' }, ...plan.locations.map(location => ({ value: location.id, label: location.name }))]} />
        <Choice label="Filter by cast" isLabelHidden width={170} value={castFilter} onChange={setCastFilter}
          options={[{ value: '', label: 'All cast' }, ...castPeople.map(person => ({ value: person.id, label: `${castIds.get(person.id)}. ${person.name}` }))]} />
      </HStack>
      <HStack gap={2} align="center">
        {view === 'Table' && <Button label={`Unscheduled (${unscheduled.length})`} aria-pressed={showUnscheduled} onClick={() => setShowUnscheduled(value => !value)} />}
        <SegmentedControl label="Stripboard view" value={view} onChange={value => setView(value as View)}>
          {VIEWS.map(({ name, icon }) => <SegmentedControlItem key={name} value={name} label={name} icon={<Glyph icon={icon} />} />)}
        </SegmentedControl>
      </HStack>
    </HStack>
    <ScriptChangeBanner changes={changes} release={snapshot.label} onOpen={() => setChangeFocus('')} />
    {!!conflicts.length && <Banner status="warning" role="status" title={`${conflicts.length} schedule ${conflicts.length === 1 ? 'conflict' : 'conflicts'}`}
      description={conflicts[0].message}
      endContent={<Button label="Review" aria-expanded={showConflicts} onClick={() => setShowConflicts(value => !value)} />} />}
    {!!conflicts.length && showConflicts && <Pane variant="muted" title="Schedule conflicts">
      <VStack gap={1}>{conflicts.map((conflict, index) => {
        const strip = plan.strips.find(item => item.id === conflict.stripIds[0]);
        const omitted = strip && !scenes.some(scene => scene.id === strip.sceneId);
        return <Item key={`${conflict.kind}-${index}`} label={conflict.message}
          endContent={!readOnly && omitted && <Button size="sm" label="Remove omitted strip" onClick={() => update(current => ({
            ...current, strips: current.strips.filter(item => item.id !== strip.id)
          }), 'Omitted scene removed from the live schedule.')} />} />;
      })}</VStack>
    </Pane>}
    {view !== 'Calendar' && <HStack gap={3} justify="between" align="center" wrap="wrap">
      <Text color="secondary">{days.length} shoot {days.length === 1 ? 'day' : 'days'} · {scenes.length - unscheduled.length} of {scenes.length} scenes scheduled · {eighthsLabel(totalEighths)} pages</Text>
      <StripLegend />
    </HStack>}
    {view === 'Table' && showUnscheduled && <Pane variant="muted" title="Unscheduled scenes" label="Unscheduled scenes">
      {unscheduled.length === 0 ? <Text>Every active scene is on the schedule.</Text> :
        <VStack gap={1}>{unscheduled.map(scene => <SourceButton key={scene.id} source={scene.source} onOpenSource={onOpenSource}>{scene.number} · {scene.heading || 'Untitled scene'}</SourceButton>)}</VStack>}
    </Pane>}
    {visibleDays.length === 0 && <Empty action={!readOnly && <Button variant="primary" label="Add shoot day" icon={<Glyph icon={Plus} />} onClick={() => open({ type: 'day' })} />}>
      Add a dated shoot day, then schedule scenes from the released script.
    </Empty>}
    {view === 'Calendar' && <Grid columns={{ minWidth: 220, repeat: 'fill' }} gap={3}>
      {visibleDays.map(day => {
        const list = dayStrips(plan, day.id);
        return <Card key={day.id} padding={4}>
          <VStack gap={1}>
            <Text type="label" color="accent">{displayDate(day.date)}</Text>
            <Heading level={3}>Day {dayNumber(day.id)} · {day.label}</Heading>
            <Text color="secondary">{unitName(day.unitId)} · Crew call {day.callTime}</Text>
            <Text color="secondary">{list.length} scheduled scenes · {eighthsLabel(list.reduce((sum, strip) => sum + strip.eighths, 0))} pages</Text>
            {!readOnly && <HStack><Button size="sm" label="Edit day" onClick={() => open({ type: 'day', detail: day })} /></HStack>}
          </VStack>
        </Card>;
      })}
    </Grid>}
    {view === 'Strips' && (visibleDays.length > 0 || unscheduled.length > 0) && <Split ratio={[3, 1]} main={<VStack gap={4}>
      {!readOnly && <VisuallyHidden id={hintId}>
        Drag strips between days, or focus a strip&rsquo;s handle and press the up or down arrow key. The actions menu moves a strip to another day.
      </VisuallyHidden>}
      {visibleDays.map(stripDay)}
    </VStack>} side={boneyard} />}
    {view === 'Table' && visibleDays.map(day => {
      const all = dayStrips(plan, day.id);
      const strips = all.filter(matches);
      const eighths = strips.reduce((sum, strip) => sum + strip.eighths, 0);
      return <Card key={day.id} padding={0} style={{ overflow: 'hidden' }}>
        {dayBand(day, `${displayDate(day.date)} · ${unitName(day.unitId)} · ${strips.length} ${strips.length === 1 ? 'scene' : 'scenes'} · ${eighthsLabel(eighths)} pages`)}
        {strips.length === 0 ? <VStack padding={4}><Text color="secondary">{all.length ? 'No scenes match these filters.' : 'No scenes scheduled for this day.'}</Text></VStack> :
          <Table<StripRow> density="compact" idKey="id" data={strips.map(strip => ({ id: strip.id, strip, scene: scenes.find(item => item.id === strip.sceneId)! }))} columns={[
            { key: 'scene', header: 'Scene', width: pixel(80), renderCell: ({ scene }) => <HStack gap={2} align="center">
              <HStack as="span" aria-hidden="true" width={12} height={12} style={{ ...toneStyle(sceneSetting(scene.heading).tone), borderRadius: 'var(--radius-element)' }} />
              <Text weight="semibold">{scene.number}</Text></HStack> },
            { key: 'start', header: 'Start', width: pixel(80), renderCell: ({ strip }) => <VStack gap={0}><Text hasTabularNumbers>{strip.startTime}</Text>
              <Text type="supporting" color="secondary">{strip.minutes} min</Text></VStack> },
            { key: 'heading', header: 'Scene heading', width: proportional(3), renderCell: ({ scene }) => {
              const change = changeById.get(scene.id);
              return <HStack gap={2} align="center" wrap="wrap"><SourceButton source={scene.source} onOpenSource={onOpenSource}>{scene.heading || 'Untitled scene'}</SourceButton>
                {change && <ScriptChangeBadge change={change} onOpen={() => setChangeFocus(change.sceneId)} />}</HStack>;
            } },
            { key: 'location', header: 'Location', width: proportional(2), renderCell: ({ strip }) => locationName(strip.locationId) || '—' },
            { key: 'pages', header: 'Pages', width: pixel(64), renderCell: ({ strip }) => eighthsLabel(strip.eighths) },
            { key: 'cast', header: 'Cast', width: proportional(2), renderCell: ({ strip, scene }) => <VStack gap={0}>
              <Text>{sceneCast(plan, scene.id).map(person => `${castIds.get(person.id)} · ${person.name}`).join(', ') || '—'}</Text>
              {conflictedStrips.has(strip.id) && <Text type="supporting" style={{ color: 'var(--color-text-warning)' }}>Review conflict</Text>}
            </VStack> },
            ...(readOnly ? [] : [{ key: 'edit', header: 'Edit', width: pixel(64), renderCell: ({ strip, scene }: StripRow) =>
              <Link label={`Edit scheduled scene ${scene.number}`} onClick={() => open({ type: 'strip', dayId: day.id, detail: strip })}>Edit</Link> }])
          ]} />}
        {!readOnly && <HStack gap={3} align="center" paddingInline={4} paddingBlock={3}>
          <Button label="Schedule scene" icon={<Glyph icon={Plus} />} onClick={() => open({ type: 'strip', dayId: day.id })} />
          <Link onClick={() => open({ type: 'day', detail: day })}>Edit day</Link>
        </HStack>}
      </Card>;
    })}
    {!readOnly && <HStack gap={2}>
      {!!visibleDays.length && <Button label="Add shoot day" icon={<Glyph icon={Plus} />} onClick={() => open({ type: 'day' })} />}
      <Button label="Add unit" icon={<Glyph icon={Plus} />} onClick={() => open({ type: 'unit' })} />
    </HStack>}
    <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    {changeFocus !== undefined && <ScriptChangeDialog plan={plan} changes={changes} focus={changeFocus || undefined} release={snapshot.label}
      onClose={() => setChangeFocus(undefined)} onReview={reviewScript} />}
    {edit && <Dialog width={edit.type === 'day' ? 720 : 560}
      title={edit.type === 'unit' ? 'Add unit' : edit.type === 'day' ? (edit.detail ? 'Edit shoot day' : 'Add shoot day') : (edit.detail ? 'Edit scheduled scene' : 'Schedule scene')}
      onClose={() => setEdit(undefined)}>
      <VStack as="form" gap={3} onSubmit={save}>
        {edit.type === 'unit' && <TextInput label="Unit name" {...field('name')} placeholder="Unit B" isRequired />}
        {edit.type === 'day' && <>
          <TextInput label="Day label" {...field('label')} placeholder="Harbour and control room" isRequired />
          <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
            <DateInput label="Shoot date" value={isoDate(draft.date)} onChange={value => setDraft(current => ({ ...current, date: value ?? '' }))} isRequired />
            <Choice label="Unit" value={draft.unit ?? ''} onChange={value => setDraft(current => ({ ...current, unit: value }))}
              options={plan.units.map(unit => ({ value: unit.id, label: unit.name }))} />
            <TimeInput label="Crew call" value={isoTime(draft.call)} onChange={value => setDraft(current => ({ ...current, call: value ?? '' }))} isRequired />
          </Grid>
          <TextArea label="Call-sheet notes" {...field('notes')} placeholder="Basecamp, access and safety details" />
          <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={3}>
            <TextInput label="Weather" {...field('weather')} placeholder="Forecast, sunrise and sunset" />
            <TextInput label="Nearest hospital" {...field('hospital')} placeholder="Name, address and A&E distance" />
          </Grid>
          <TextInput label="Parking and basecamp" {...field('parking')} placeholder="Unit base, crew parking and shuttle" />
          <DayScenePicker project={project} plan={plan} dayId={edit.detail?.id} scenes={scenes} eighthsOf={scene => scriptFor(scene)?.eighths ?? 1}
            chosen={chosen} onChosenChange={setChosen} />
        </>}
        {edit.type === 'strip' && <>
          <Choice label="Scene" value={draft.scene ?? ''} onChange={value => {
            const scene = scenes.find(item => item.id === value);
            setDraft(current => ({ ...current, scene: value, ...(!edit.detail && scene ? { eighths: String(scriptFor(scene)?.eighths ?? 1) } : {}) }));
          }} options={scenes.map(scene => ({ value: scene.id, label: `${scene.number} · ${scene.heading || 'Untitled scene'}` }))} />
          <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={3}>
            <Choice label="Shoot day" value={draft.day ?? ''} onChange={value => setDraft(current => ({ ...current, day: value }))} options={dayOptions} />
            <Choice label="Location" value={draft.location ?? ''} onChange={value => setDraft(current => ({ ...current, location: value }))}
              options={[{ value: '', label: 'Unassigned' }, ...plan.locations.map(location => ({ value: location.id, label: location.name }))]} />
          </Grid>
          <Grid columns={{ minWidth: 140, repeat: 'fit' }} gap={3}>
            <TimeInput label="Start time" value={isoTime(draft.start)} onChange={value => setDraft(current => ({ ...current, start: value ?? '' }))} isRequired />
            <TextInput label="Minutes" {...field('minutes')} isRequired />
            <TextInput label="Page eighths" {...field('eighths')} isRequired />
          </Grid>
        </>}
        <FormError>{error}</FormError>
        <HStack gap={2} justify="end">
          {edit.type === 'strip' && edit.detail && <Button label="Remove from day" onClick={() => {
            const id = edit.detail?.id;
            if (update(current => ({ ...current, strips: current.strips.filter(item => item.id !== id) }), 'Scene returned to unscheduled.')) setEdit(undefined);
          }} />}
          <Button type="submit" variant="primary" label={edit.type === 'unit' ? 'Add unit' : edit.type === 'day' ? 'Save shoot day' : 'Save scheduled scene'} />
        </HStack>
      </VStack>
    </Dialog>}
  </VStack>;
}
