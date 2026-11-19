import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Check, CloudSun, Download, FileCheck2, Hospital, MapPin, Printer } from 'lucide-react';
import { useState } from 'react';
import { newId } from '../model';
import { Choice, Dialog, Empty, Glyph, Pane, Paper, SourceButton, displayDate, downloadText } from './components';
import type { PaneProps } from './components';
import { acknowledgeTestDelivery, callSheetCsv, dayStrips, eighthsLabel, issueCallSheet, orderedDays, previewCallSheet, recordTestDelivery, scheduleConflicts } from './model';
import type { CallSheet, ProductionPlan } from './model';
import type { Project } from '../model';
import { PersonAvatar } from './media';

export function CallSheets({ project, plan, readOnly, update, onOpenSource }: PaneProps) {
  const days = orderedDays(plan);
  const [dayId, setDayId] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [show, setShow] = useState(false);
  const currentDay = days.find(day => day.id === dayId) ?? days[0];
  const issued = [...plan.callSheets].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.version - a.version);
  const currentSheet = issued.find(item => item.id === sheetId);
  const superseded = currentSheet && issued.some(sheet => sheet.dayId === currentSheet.dayId && sheet.version > currentSheet.version);
  let preview: CallSheet | undefined;
  if (currentDay && dayStrips(plan, currentDay.id).length) {
    preview = previewCallSheet(project, plan, currentDay.id);
  }
  const visible = currentSheet ?? preview;
  const currentStrips = new Set(plan.strips.filter(strip => strip.dayId === currentDay?.id).map(strip => strip.id));
  const blockingConflicts = !currentSheet && show
    ? scheduleConflicts(plan).filter(conflict => conflict.stripIds.some(id => currentStrips.has(id)))
    : [];

  function issue() {
    if (!currentDay || readOnly) return;
    const at = new Date().toISOString();
    const id = newId();
    if (update((current, currentProject) => ({
      ...current,
      callSheets: [...current.callSheets, { ...issueCallSheet(currentProject, current, currentDay.id, at), id }]
    }), 'Call sheet issued.')) {
      setSheetId(id);
    }
  }

  return <>
    {!days.length && !issued.length ? <Empty>Add a shoot day and schedule scenes to prepare a dated call sheet.</Empty> :
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4} align="start">
        <Pane title="Prepare a call sheet">
          <Choice label="Shoot day" value={currentDay?.id ?? ''} onChange={setDayId}
            options={days.map(day => ({ value: day.id, label: `${day.date} · ${plan.units.find(unit => unit.id === day.unitId)?.name} · ${day.label}` }))} />
          {!preview && <Text color="secondary">Schedule at least one scene on this shoot day.</Text>}
          {preview && <Item label={`${preview.label} · V${preview.version}`}
            description={`${displayDate(preview.date)} · ${preview.scenes.length} ${preview.scenes.length === 1 ? 'scene' : 'scenes'} · Crew call ${preview.callTime}`}
            endContent={<Button variant="primary" label="Preview call sheet" onClick={() => { setSheetId(''); setShow(true); }} />} />}
        </Pane>
        <Pane title="Issued versions">
          {!issued.length && <Text color="secondary">Issued call sheets and test acknowledgements appear here.</Text>}
          {issued.length > 0 && <VStack gap={1}>{issued.map(sheet => {
            const deliveries = plan.deliveries.filter(item => item.callSheetId === sheet.id);
            const acknowledged = deliveries.filter(item => item.acknowledgedAt).length;
            const previous = issued.some(item => item.dayId === sheet.dayId && item.version > sheet.version);
            return <Item key={sheet.id} label={`${sheet.label} · V${sheet.version}`}
              description={`${sheet.date} · ${sheet.unit} · ${previous ? 'Superseded' : 'Current'} · ${acknowledged}/${deliveries.length} acknowledged`}
              endContent={<Button label={`Open V${sheet.version}`} onClick={() => { setSheetId(sheet.id); setShow(true); }} />} />;
          })}</VStack>}
        </Pane>
      </Grid>}
    {show && visible && <Dialog title={currentSheet ? `Issued call sheet V${visible.version}` : `Preview call sheet V${visible.version}`} width={920} onClose={() => setShow(false)} print>
      <CallSheetDocument sheet={visible} superseded={Boolean(superseded)} issued={Boolean(currentSheet)} project={project} plan={plan} />
      <HStack gap={2} align="center" wrap="wrap">
        <SourceButton source={visible.source} onOpenSource={onOpenSource}>Open issued script</SourceButton>
        <Button label="Print call sheet" icon={<Glyph icon={Printer} />} onClick={() => window.print()} />
        <Button label="Download CSV" icon={<Glyph icon={Download} />} onClick={() => downloadText(
          `swdr-call-sheet-${visible.date}-v${visible.version}.csv`, callSheetCsv(visible)
        )} />
        {!currentSheet && !readOnly && <Button variant="primary" icon={<Glyph icon={FileCheck2} />} label={visible.version > 1 ? 'Reissue call sheet' : 'Issue call sheet'}
          onClick={issue} isDisabled={blockingConflicts.length > 0} />}
      </HStack>
      {blockingConflicts.length > 0 && <Banner status="warning" title="Resolve before issue" aria-label="Conflicts preventing issue"
        description={blockingConflicts.map(conflict => conflict.message).join(' ')} />}
      {currentSheet && visible.recipients.length > 0 && <Pane variant="muted" title="Test delivery and acknowledgement" description="Test records stay in this project.">
        <VStack gap={1}>{visible.recipients.map(person => {
          const delivery = plan.deliveries.find(item => item.callSheetId === currentSheet.id && item.personId === person.id);
          return <Item key={person.id} label={person.name}
            description={delivery?.acknowledgedAt ? 'Acknowledged' : delivery ? 'Awaiting acknowledgement' : 'Awaiting test delivery'}
            endContent={!readOnly && !superseded && (delivery
              ? !delivery.acknowledgedAt && <Button label="Acknowledge test" icon={<Glyph icon={Check} />} onClick={() => update(
                current => acknowledgeTestDelivery(current, delivery.id), 'Test acknowledgement recorded.'
              )} />
              : <Button label="Send test" onClick={() => update(
                current => recordTestDelivery(current, currentSheet.id, person.id), 'Test delivery recorded.'
              )} />)} />;
        })}</VStack>
      </Pane>}
    </Dialog>}
  </>;
}

type Sheet = CallSheet;
interface SceneRow extends Record<string, unknown> { id: string; scene: Sheet['scenes'][number] }
interface PersonRow extends Record<string, unknown> { id: string; person: Sheet['recipients'][number] }

function CallSheetDocument({ sheet, superseded, issued, project, plan }: { sheet: CallSheet; superseded: boolean; issued: boolean; project: Project; plan: ProductionPlan }) {
  const face = (id: string, name: string) => {
    const person = plan.people.find(item => item.id === id);
    return <PersonAvatar project={project} person={{ name, photoAssetId: person?.photoAssetId }} size={32} decorative />;
  };
  // Sheets issued before cast and crew were recorded separately keep one combined personnel list.
  const legacy = sheet.recipients.every(person => !person.type);
  const cast = legacy ? [] : sheet.recipients.filter(person => person.type === 'Cast');
  const crew = sheet.recipients.filter(person => !cast.includes(person));
  const pages = sheet.scenes.reduce((sum, scene) => sum + (scene.eighths ?? 0), 0);
  const hasPages = sheet.scenes.some(scene => scene.eighths !== undefined);
  const details = [
    { icon: CloudSun, label: 'Weather', value: sheet.weather },
    { icon: Hospital, label: 'Nearest hospital', value: sheet.hospital },
    { icon: MapPin, label: 'Parking and basecamp', value: sheet.parking }
  ].filter(detail => detail.value);
  const named = (id: string, name: string) => <HStack gap={2} align="center">{face(id, name)}<Text>{name}</Text></HStack>;
  return <Paper>
    <VStack gap={5}>
      <HStack gap={4} justify="between" align="start" wrap="wrap">
        <VStack gap={1}>
          <Text type="label" color="accent">Call sheet{sheet.dayNumber ? ` · Day ${sheet.dayNumber}${sheet.dayCount ? ` of ${sheet.dayCount}` : ''}` : ''}</Text>
          <Heading level={2}>{sheet.projectTitle}</Heading>
          <Text color="secondary">{sheet.documentTitle} · {sheet.draft}</Text>
        </VStack>
        <Card variant="muted" padding={4}>
          <VStack gap={0.5} hAlign="end">
            <Text type="supporting" color="secondary">General crew call</Text>
            <Text size="3xl" weight="bold" hasTabularNumbers>{sheet.callTime}</Text>
            <Text>{displayDate(sheet.date)}</Text>
            <Text type="supporting" color="secondary">{sheet.unit} · V{sheet.version}{superseded && ' · Superseded'}</Text>
          </VStack>
        </Card>
      </HStack>
      <Heading level={3}>{sheet.label}</Heading>
      {details.length > 0 && <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={4}>
        {details.map(({ icon, label, value }) => <MetadataList key={label} label={{ position: 'top' }}>
          <MetadataListItem label={label} icon={<Glyph icon={icon} />}>{value}</MetadataListItem>
        </MetadataList>)}
      </Grid>}
      {sheet.notes && <Text as="p" style={{ whiteSpace: 'pre-line' }}>{sheet.notes}</Text>}
      <VStack gap={2}>
        <Heading level={3}>Scheduled scenes</Heading>
        <Table<SceneRow> density="compact" idKey="id" data={sheet.scenes.map((scene, index) => ({ id: `${scene.id}-${index}`, scene }))} columns={[
          { key: 'time', header: 'Time', width: pixel(80), renderCell: ({ scene }) => <VStack gap={0}><Text hasTabularNumbers>{scene.startTime}</Text>
            <Text type="supporting" color="secondary">{scene.minutes} min</Text></VStack> },
          { key: 'scene', header: 'Scene', width: pixel(64), renderCell: ({ scene }) => <Text weight="semibold">{scene.number}</Text> },
          { key: 'set', header: 'Set and setting', width: proportional(3), renderCell: ({ scene }) => <VStack gap={0}>
            <Text weight="semibold">{scene.heading}</Text>{scene.setting && <Text type="supporting" color="secondary">{scene.setting}</Text>}</VStack> },
          ...(hasPages ? [{ key: 'pages', header: 'Pages', width: pixel(64), renderCell: ({ scene }: SceneRow) => scene.eighths === undefined ? '—' : eighthsLabel(scene.eighths) }] : []),
          { key: 'cast', header: 'Cast', width: proportional(2), renderCell: ({ scene }) => scene.cast.length ? <HStack gap={2} wrap="wrap">
            {scene.cast.map((name, at) => <HStack as="span" key={`${name}-${at}`} gap={1} align="center">
              {scene.castIds?.[at] ? <Badge label={String(scene.castIds[at])} /> : null}{name}</HStack>)}
          </HStack> : '—' },
          { key: 'location', header: 'Location', width: proportional(2), renderCell: ({ scene }) => <VStack gap={0}>
            <Text>{scene.location?.name ?? '—'}</Text>{scene.location?.address && <Text type="supporting" color="secondary">{scene.location.address}</Text>}</VStack> }
        ]} />
        {hasPages && <Text type="supporting" color="secondary">{sheet.scenes.length} {sheet.scenes.length === 1 ? 'scene' : 'scenes'} · {eighthsLabel(pages)} pages</Text>}
      </VStack>
      {cast.length > 0 && <VStack gap={2}>
        <Heading level={3}>Cast</Heading>
        <Table<PersonRow> density="compact" idKey="id" data={cast.map(person => ({ id: person.id, person }))} columns={[
          { key: 'castId', header: 'ID', width: pixel(56), renderCell: ({ person }) => person.castId ?? '—' },
          { key: 'character', header: 'Character', width: proportional(2), renderCell: ({ person }) => named(person.id, person.name) },
          { key: 'artist', header: 'Artist', width: proportional(2), renderCell: ({ person }) => person.role },
          { key: 'call', header: 'Call', width: pixel(80), renderCell: ({ person }) => <Text weight="semibold" hasTabularNumbers>{person.callTime}</Text> }
        ]} />
      </VStack>}
      {crew.length > 0 && <VStack gap={2}>
        <Heading level={3}>{legacy ? 'Personnel calls' : 'Crew'}</Heading>
        <Table<PersonRow> density="compact" idKey="id" data={crew.map(person => ({ id: person.id, person }))} columns={[
          { key: 'name', header: 'Name', width: proportional(2), renderCell: ({ person }) => named(person.id, person.name) },
          { key: 'role', header: 'Role', width: proportional(2), renderCell: ({ person }) => person.role },
          { key: 'call', header: 'Call', width: pixel(80), renderCell: ({ person }) => <Text hasTabularNumbers>{person.callTime}</Text> }
        ]} />
      </VStack>}
      <Text type="supporting" color="secondary">Source revision {sheet.source.revisionId}{issued && ` · Issued ${sheet.issuedAt}`}</Text>
    </VStack>
  </Paper>;
}
