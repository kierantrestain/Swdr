import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { cellKey, storyMap, unitRecords } from './series-analysis';
import type { Character, StoryPoint, StoryState } from './series-model';
import type { StoryStructure, StoryUnit } from './story-profile';
import { Pane, PaneHeading } from './StoryControls';
import { CharacterAvatar, PointRows, relationshipStyle } from './StoryParts';
import type { CanonLookup } from './StoryParts';

function level(count: number): number {
  return count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
}

const HEAT_BG = [
  'var(--color-background-muted)',
  'color-mix(in srgb, var(--color-accent) 16%, var(--color-background-surface))',
  'color-mix(in srgb, var(--color-accent) 32%, var(--color-background-surface))',
  'color-mix(in srgb, var(--color-accent) 56%, var(--color-background-surface))',
  'var(--color-accent)'
];

const HEAT_INK = [
  'var(--color-text-secondary)',
  'var(--color-text-primary)',
  'var(--color-text-primary)',
  'var(--color-text-primary)',
  'var(--color-on-accent)'
];

function describe(points: StoryPoint[]): string {
  const interactions = points.filter(point => point.kind === 'interaction').length;
  const turns = points.filter(point => point.kind === 'relationship').map(point => point.relationship);
  const parts = [`${points.length} record${points.length === 1 ? '' : 's'}`];
  if (interactions) parts.push(`${interactions} interaction${interactions === 1 ? '' : 's'}`);
  if (turns.length) parts.push(`relationship ${turns.join(', ')}`);
  if (points.some(point => point.kind === 'arc')) parts.push('arc milestone');
  if (points.some(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes')) parts.push('open question');
  return parts.join(', ');
}

interface Selection {
  unitId: string;
  characterId?: string;
}

const FUTURE_STYLE: CSSProperties = {
  background: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--color-border) 4px 5px)',
  color: 'var(--color-text-disabled)'
};

export function StoryMap({ project, structure, data, units, cutoff, onOpen, onDossier, states }: {
  project: Project;
  structure: StoryStructure;
  data: StoryState;
  units: StoryUnit[];
  cutoff: number;
  onOpen: WorkspaceViewProps['onOpenSource'];
  onDossier: (id: string) => void;
  states: CanonLookup;
}) {
  const [selection, setSelection] = useState<Selection>();
  const [cursor, setCursor] = useState({ row: 0, column: 0 });
  const unitPositions = new Map(structure.units.map((unit, idx) => [unit.id, idx]));
  const cells = storyMap(project, data, structure.document?.id);
  const byUnit = unitRecords(project, data.points, structure.document?.id);
  const future = (unit: StoryUnit) => (unitPositions.get(unit.id) ?? 0) > cutoff;
  const groupNumbers = [...new Set(units.map(unit => unit.groupNumber))];
  const groupLabelOf = (num: number) => structure.groups.find(g => g.number === num)?.label ?? `${structure.terms.groupLabel} ${num}`;

  const characters = [...data.characters].sort((a, b) => {
    const total = (person: Character) => units.reduce((sum, unit) => sum + (cells.get(cellKey(person.id, unit.id))?.length ?? 0), 0);
    return total(b) - total(a);
  });
  const revealed = units.filter(unit => !future(unit));
  const selectedUnit = selection && units.find(unit => unit.id === selection.unitId);
  const selectedPerson = selection?.characterId ? data.characters.find(person => person.id === selection.characterId) : undefined;
  const selectedRows = !selection ? [] : selection.characterId
    ? cells.get(cellKey(selection.characterId, selection.unitId)) ?? []
    : byUnit.get(selection.unitId) ?? [];
  const records = revealed.reduce((sum, unit) => sum + (byUnit.get(unit.id)?.length ?? 0), 0);

  const unitNoun = structure.terms.unitSingular;
  const unitPlural = structure.terms.unitPlural;
  const minCellPx = structure.bucketed ? 54 : 29;

  function move(event: KeyboardEvent<HTMLTableElement>) {
    const steps: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    let target: { row: number; column: number } | undefined;
    if (steps[event.key]) {
      const [dr, dc] = steps[event.key];
      target = {
        row: Math.min(characters.length - 1, Math.max(0, cursor.row + dr)),
        column: Math.min(revealed.length - 1, Math.max(0, cursor.column + dc))
      };
    } else if (event.key === 'Home') target = { row: cursor.row, column: 0 };
    else if (event.key === 'End') target = { row: cursor.row, column: revealed.length - 1 };
    if (!target) return;
    event.preventDefault();
    setCursor(target);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-cell="${target.row}:${target.column}"]`)?.focus();
  }

  return <Pane label="Story map" padding={5}>
    <PaneHeading
      title="Story map"
      description={`${characters.length} character${characters.length === 1 ? '' : 's'} · ${revealed.length} of ${units.length} ${units.length === 1 ? unitNoun : unitPlural} revealed · ${records} record${records === 1 ? '' : 's'}. Select a cell for the exact scenes.`}
      level={2}
    />

    <HStack gap={4} align="center" wrap="wrap" aria-label="Story map key">
      {([
        [1, '1'],
        [2, '2–3'],
        [3, '4–5'],
        [4, '6+ records']
      ] as const).map(([lvl, label]) => <HStack as="span" key={label} gap={1.5} align="center">
        <Card
          padding={0}
          aria-hidden="true"
          style={{
            width: '12px',
            height: '12px',
            borderRadius: 'var(--radius-inner)',
            background: HEAT_BG[lvl],
            border: '1px solid var(--color-border)'
          }}
        />
        <Text type="supporting" color="secondary" size="xsm">{label}</Text>
      </HStack>)}
      <HStack as="span" gap={1.5} align="center">
        <Card
          padding={0}
          aria-hidden="true"
          style={{
            width: '14px',
            height: '4px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-error)',
            border: 'none'
          }}
        />
        <Text type="supporting" color="secondary" size="xsm">Relationship turn</Text>
      </HStack>
      <HStack as="span" gap={1.5} align="center">
        <Card
          padding={0}
          aria-hidden="true"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent)',
            border: 'none'
          }}
        />
        <Text type="supporting" color="secondary" size="xsm">Arc milestone</Text>
      </HStack>
      <HStack as="span" gap={1.5} align="center">
        <Card
          padding={0}
          aria-hidden="true"
          style={{
            width: '9px',
            height: '9px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-background-surface)',
            border: '2px solid var(--color-warning)'
          }}
        />
        <Text type="supporting" color="secondary" size="xsm">Open question</Text>
      </HStack>
    </HStack>

    {characters.length && units.length ? <VStack style={{ overflowX: 'auto', paddingBottom: 'var(--spacing-1)' }}>
      <table
        onKeyDown={move}
        aria-label={`Characters by ${unitNoun}. Use arrow keys to move between cells.`}
        style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '2px', tableLayout: 'fixed', minWidth: `${Math.max(640, 158 + units.length * minCellPx + 44)}px` }}
      >
        <thead>
          <tr>
            <th
              rowSpan={2}
              scope="col"
              style={{
                width: '158px', textAlign: 'left', position: 'sticky', left: 0, zIndex: 2,
                background: 'var(--color-background-surface)', padding: 'var(--spacing-1) var(--spacing-2)',
                fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600
              }}
            >
              Character
            </th>
            {groupNumbers.map(groupNum => <th
              key={groupNum}
              scope="colgroup"
              colSpan={units.filter(unit => unit.groupNumber === groupNum).length}
              style={{
                textAlign: 'left', padding: 'var(--spacing-1) var(--spacing-2)',
                borderBottom: '1px solid var(--color-border-emphasized)',
                fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', fontWeight: 700
              }}
            >
              {groupLabelOf(groupNum)}
            </th>)}
            <th
              rowSpan={2}
              scope="col"
              style={{
                width: '44px', textAlign: 'center', fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)', fontWeight: 600
              }}
            >
              Total
            </th>
          </tr>
          <tr>
            {units.map(unit => {
              const isFuture = future(unit);
              const isSelectedCol = Boolean(selection && !selection.characterId && selection.unitId === unit.id);
              const groupBorder = unit.isGroupStart ? '2px solid var(--color-border-emphasized)' : undefined;
              return <th
                key={unit.id}
                scope="col"
                style={{
                  ...(isFuture ? FUTURE_STYLE : {}),
                  borderLeft: groupBorder,
                  padding: '2px',
                  textAlign: 'center',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600
                }}
              >
                {isFuture ? (
                  <Text as="span" type="supporting" color="disabled" size="xsm" aria-label={`${unit.code} · not yet revealed`}>
                    {unit.shortAxis}
                  </Text>
                ) : (
                  <button
                    type="button"
                    title={`${unit.code} · ${unit.title}`}
                    aria-label={`${unit.code} ${unit.title}: show every record`}
                    onClick={() => setSelection({ unitId: unit.id })}
                    style={{
                      width: '100%',
                      minHeight: '24px',
                      padding: '2px 0',
                      border: 'none',
                      borderRadius: 'var(--radius-inner)',
                      background: isSelectedCol ? 'var(--color-accent-muted)' : 'transparent',
                      color: isSelectedCol ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: isSelectedCol ? 700 : 600,
                      cursor: 'pointer'
                    }}
                  >
                    {unit.shortAxis}
                  </button>
                )}
              </th>;
            })}
          </tr>
        </thead>

        <tbody>
          <tr>
            <th
              scope="row"
              style={{
                textAlign: 'left', position: 'sticky', left: 0, zIndex: 2,
                background: 'var(--color-background-surface)', padding: 'var(--spacing-1) var(--spacing-2)',
                fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600
              }}
            >
              {structure.mode === 'episodic' ? 'Major events' : 'Major beats'}
            </th>
            {units.map(unit => {
              const isFuture = future(unit);
              const events = (byUnit.get(unit.id) ?? []).filter(point => point.kind === 'event');
              return <td
                key={unit.id}
                title={events.map(event => event.title).join('\n')}
                style={{
                  ...(isFuture ? FUTURE_STYLE : {}),
                  borderLeft: unit.isGroupStart ? '2px solid var(--color-border-emphasized)' : undefined,
                  height: '24px',
                  textAlign: 'center',
                  verticalAlign: 'middle'
                }}
              >
                {!isFuture && events.length > 0 && <HStack as="span" gap={0.5} align="center" justify="center" style={{ display: 'inline-flex' }}>
                  {events.slice(0, 3).map(event => (
                    <svg key={event.id} width="8" height="8" aria-hidden="true">
                      <polygon points="4,0.5 7.5,4 4,7.5 0.5,4" fill="var(--color-accent)" />
                    </svg>
                  ))}
                  <VisuallyHidden>{events.length} event{events.length === 1 ? '' : 's'}: {events.map(event => event.title).join('; ')}</VisuallyHidden>
                </HStack>}
              </td>;
            })}
            <td style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {revealed.reduce((sum, unit) => sum + (byUnit.get(unit.id) ?? []).filter(point => point.kind === 'event').length, 0)}
            </td>
          </tr>

          {characters.map((person, row) => {
            let total = 0;
            const introUnitId = structure.unitOfSource(person.source)?.id;
            return <tr key={person.id}>
              <th
                scope="row"
                style={{
                  textAlign: 'left', position: 'sticky', left: 0, zIndex: 2,
                  background: 'var(--color-background-surface)', padding: '2px var(--spacing-2) 2px 0'
                }}
              >
                <button
                  type="button"
                  onClick={() => onDossier(person.id)}
                  aria-label={`Open ${person.name} dossier`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-2)',
                    width: '100%',
                    minHeight: '38px',
                    padding: 'var(--spacing-1) var(--spacing-1-5)',
                    border: 'none',
                    borderRadius: 'var(--radius-element)',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <CharacterAvatar project={project} character={person} size={24} decorative />
                  <VStack gap={0} style={{ minWidth: 0, flex: 1 }}>
                    <Text weight="semibold" size="sm" maxLines={1}>{person.name}</Text>
                    <Text type="supporting" color="secondary" size="xsm" maxLines={1}>{person.role || 'Character'}</Text>
                  </VStack>
                </button>
              </th>

              {units.map(unit => {
                const groupBorder = unit.isGroupStart ? '2px solid var(--color-border-emphasized)' : undefined;
                if (future(unit)) {
                  return <td
                    key={unit.id}
                    aria-label={`${unit.code} not yet revealed`}
                    style={{ ...FUTURE_STYLE, borderLeft: groupBorder, borderRadius: 'var(--radius-inner)' }}
                  />;
                }
                const column = revealed.indexOf(unit);
                const points = cells.get(cellKey(person.id, unit.id)) ?? [];
                total += points.length;
                const lvl = level(points.length);
                const turn = points.filter(point => point.kind === 'relationship').at(-1);
                const hasArc = points.some(point => point.kind === 'arc');
                const hasOpen = points.some(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes');
                const draft = points.some(point => states?.get(point.id) && states.get(point.id) !== 'approved');
                const selected = selection?.characterId === person.id && selection.unitId === unit.id;
                const intro = introUnitId === unit.id;

                return <td key={unit.id} style={{ borderLeft: groupBorder, padding: '1px' }}>
                  <button
                    type="button"
                    data-cell={`${row}:${column}`}
                    tabIndex={cursor.row === row && cursor.column === column ? 0 : -1}
                    aria-pressed={selected}
                    aria-label={`${person.name} in ${unit.code} ${unit.title}: ${points.length ? describe(points) : 'no records'}${intro ? ', introduced' : ''}${draft ? ', includes draft records not in canon' : ''}`}
                    onFocus={() => setCursor({ row, column })}
                    onClick={() => setSelection({ unitId: unit.id, characterId: person.id })}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '38px',
                      minHeight: 0,
                      padding: 0,
                      borderRadius: 'var(--radius-inner)',
                      background: HEAT_BG[lvl],
                      color: HEAT_INK[lvl],
                      border: draft ? '1.5px dashed var(--color-warning)' : selected ? '2px solid var(--color-accent)' : '1px solid transparent',
                      boxShadow: intro ? 'inset 3px 0 0 var(--color-text-primary)' : undefined,
                      outline: selected ? '2px solid var(--color-accent)' : undefined,
                      outlineOffset: selected ? '1px' : undefined,
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      cursor: 'pointer'
                    }}
                  >
                    {points.length > 0 ? points.length : ''}
                    {turn?.relationship && (
                      <svg
                        viewBox="0 0 36 4"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        style={{ position: 'absolute', left: '10%', width: '80%', bottom: '3px', height: '3.5px', pointerEvents: 'none' }}
                      >
                        <rect x="0" y="0" width="36" height="4" rx="2" fill={relationshipStyle[turn.relationship].stroke} />
                      </svg>
                    )}
                    {hasArc && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                        style={{ position: 'absolute', top: '3px', right: '3px', pointerEvents: 'none' }}
                      >
                        <circle cx="5" cy="5" r="3.4" fill="var(--color-accent)" stroke="var(--color-background-surface)" strokeWidth="1.5" />
                      </svg>
                    )}
                    {hasOpen && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                        style={{ position: 'absolute', top: '3px', left: '3px', pointerEvents: 'none' }}
                      >
                        <circle cx="5" cy="5" r="3.2" fill="var(--color-background-surface)" stroke="var(--color-warning)" strokeWidth="1.8" />
                      </svg>
                    )}
                  </button>
                </td>;
              })}

              <td style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {total}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </VStack> : <Text color="secondary">No characters in this view.</Text>}

    <Divider />

    <Card variant="muted" padding={4} role="region" aria-label="Selected story map detail" aria-live="polite">
      {selectedUnit ? <VStack gap={3}>
        <HStack gap={3} align="center" justify="between" wrap="wrap">
          <HStack gap={3} align="center">
            {selectedPerson && <CharacterAvatar project={project} character={selectedPerson} size={40} decorative />}
            <VStack gap={0.5}>
              <Heading level={3}>
                {selectedPerson ? `${selectedPerson.name} · ${selectedUnit.code}` : `${selectedUnit.code} · every record`}
              </Heading>
              <Text type="supporting" color="secondary">
                {selectedUnit.title}{selectedPerson && structure.unitOfSource(selectedPerson.source)?.id === selectedUnit.id ? ` · introduced in this ${unitNoun}` : ''}
              </Text>
            </VStack>
          </HStack>
          {selectedPerson && (
            <Button
              size="sm"
              label={`Open ${selectedPerson.name.split(' ')[0]}’s dossier`}
              onClick={() => onDossier(selectedPerson.id)}
            />
          )}
        </HStack>
        <PointRows
          rows={selectedRows}
          project={project}
          onOpen={onOpen}
          showKind
          people={data.characters}
          states={states}
          empty={selectedPerson ? `${selectedPerson.name} has no records in this ${unitNoun}.` : `No records in this ${unitNoun}.`}
        />
      </VStack> : (
        <Text type="supporting" color="secondary">
          Choose a character and {unitNoun} to list the interactions, turns and reveals behind it, each linked to its exact script line.
        </Text>
      )}
    </Card>
  </Pane>;
}
