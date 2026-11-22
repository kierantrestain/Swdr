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
import type { Episode, Project, WorkspaceViewProps } from '../model';
import { episodeCode } from './source';
import { cellKey, episodePositions, episodeRecords, storyMap } from './series-analysis';
import type { Character, StoryPoint, StoryState } from './series-model';
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
  episodeId: string;
  characterId?: string;
}

const FUTURE_STYLE: CSSProperties = {
  background: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--color-border) 4px 5px)',
  color: 'var(--color-text-disabled)'
};

export function StoryMap({ project, data, episodes, cutoff, onOpen, onDossier, states }: {
  project: Project;
  data: StoryState;
  episodes: Episode[];
  cutoff: number;
  onOpen: WorkspaceViewProps['onOpenSource'];
  onDossier: (id: string) => void;
  states: CanonLookup;
}) {
  const [selection, setSelection] = useState<Selection>();
  const [cursor, setCursor] = useState({ row: 0, column: 0 });
  const positions = episodePositions(project);
  const cells = storyMap(project, data);
  const byEpisode = episodeRecords(project, data.points);
  const future = (episode: Episode) => (positions.get(episode.id) ?? 0) > cutoff;
  const seasons = [...new Set(episodes.map(episode => episode.season))];
  const characters = [...data.characters].sort((a, b) => {
    const total = (person: Character) => episodes.reduce((sum, episode) => sum + (cells.get(cellKey(person.id, episode.id))?.length ?? 0), 0);
    return total(b) - total(a);
  });
  const revealed = episodes.filter(episode => !future(episode));
  const selectedEpisode = selection && episodes.find(episode => episode.id === selection.episodeId);
  const selectedPerson = selection?.characterId ? data.characters.find(person => person.id === selection.characterId) : undefined;
  const selectedRows = !selection ? [] : selection.characterId
    ? cells.get(cellKey(selection.characterId, selection.episodeId)) ?? []
    : byEpisode.get(selection.episodeId) ?? [];
  const records = revealed.reduce((sum, episode) => sum + (byEpisode.get(episode.id)?.length ?? 0), 0);

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
      description={`${characters.length} characters · ${revealed.length} of ${episodes.length} episodes revealed · ${records} records. Select a cell for the exact scenes.`}
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

    {characters.length ? <VStack style={{ overflowX: 'auto', paddingBottom: 'var(--spacing-1)' }}>
      <table
        onKeyDown={move}
        aria-label="Characters by episode. Use arrow keys to move between cells."
        style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '2px', tableLayout: 'fixed', minWidth: `${Math.max(640, 158 + episodes.length * 29 + 44)}px` }}
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
            {seasons.map(season => <th
              key={season}
              scope="colgroup"
              colSpan={episodes.filter(episode => episode.season === season).length}
              style={{
                textAlign: 'left', padding: 'var(--spacing-1) var(--spacing-2)',
                borderBottom: '1px solid var(--color-border-emphasized)',
                fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', fontWeight: 700
              }}
            >
              Season {season}
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
            {episodes.map(episode => {
              const isFuture = future(episode);
              const isSelectedCol = Boolean(selection && !selection.characterId && selection.episodeId === episode.id);
              const seasonBorder = episode.number === 1 ? '2px solid var(--color-border-emphasized)' : undefined;
              return <th
                key={episode.id}
                scope="col"
                style={{
                  ...(isFuture ? FUTURE_STYLE : {}),
                  borderLeft: seasonBorder,
                  padding: '2px',
                  textAlign: 'center',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600
                }}
              >
                {isFuture ? (
                  <Text as="span" type="supporting" color="disabled" size="xsm" aria-label={`${episodeCode(episode)} · not yet revealed`}>
                    {episode.number}
                  </Text>
                ) : (
                  <button
                    type="button"
                    title={`${episodeCode(episode)} · ${episode.title}`}
                    aria-label={`${episodeCode(episode)} ${episode.title}: show every record`}
                    onClick={() => setSelection({ episodeId: episode.id })}
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
                    {episode.number}
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
              Major events
            </th>
            {episodes.map(episode => {
              const isFuture = future(episode);
              const events = (byEpisode.get(episode.id) ?? []).filter(point => point.kind === 'event');
              return <td
                key={episode.id}
                title={events.map(event => event.title).join('\n')}
                style={{
                  ...(isFuture ? FUTURE_STYLE : {}),
                  borderLeft: episode.number === 1 ? '2px solid var(--color-border-emphasized)' : undefined,
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
              {revealed.reduce((sum, episode) => sum + (byEpisode.get(episode.id) ?? []).filter(point => point.kind === 'event').length, 0)}
            </td>
          </tr>

          {characters.map((person, row) => {
            let total = 0;
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

              {episodes.map(episode => {
                const seasonBorder = episode.number === 1 ? '2px solid var(--color-border-emphasized)' : undefined;
                if (future(episode)) {
                  return <td
                    key={episode.id}
                    aria-label={`${episodeCode(episode)} not yet revealed`}
                    style={{ ...FUTURE_STYLE, borderLeft: seasonBorder, borderRadius: 'var(--radius-inner)' }}
                  />;
                }
                const column = revealed.indexOf(episode);
                const points = cells.get(cellKey(person.id, episode.id)) ?? [];
                total += points.length;
                const lvl = level(points.length);
                const turn = points.filter(point => point.kind === 'relationship').at(-1);
                const hasArc = points.some(point => point.kind === 'arc');
                const hasOpen = points.some(point => point.knowledge === 'Unresolved' || point.knowledge === 'Believes');
                const draft = points.some(point => states?.get(point.id) && states.get(point.id) !== 'approved');
                const selected = selection?.characterId === person.id && selection.episodeId === episode.id;
                const intro = person.source.episodeId === episode.id;

                return <td key={episode.id} style={{ borderLeft: seasonBorder, padding: '1px' }}>
                  <button
                    type="button"
                    data-cell={`${row}:${column}`}
                    tabIndex={cursor.row === row && cursor.column === column ? 0 : -1}
                    aria-pressed={selected}
                    aria-label={`${person.name} in ${episodeCode(episode)} ${episode.title}: ${points.length ? describe(points) : 'no records'}${intro ? ', introduced' : ''}${draft ? ', includes draft records not in canon' : ''}`}
                    onFocus={() => setCursor({ row, column })}
                    onClick={() => setSelection({ episodeId: episode.id, characterId: person.id })}
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
                    {(turn?.relationship || hasArc || hasOpen) && (
                      <svg
                        viewBox="0 0 36 36"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                      >
                        {turn?.relationship && (
                          <rect x="4" y="30" width="28" height="3.5" rx="1.75" fill={relationshipStyle[turn.relationship].stroke} />
                        )}
                        {hasArc && (
                          <circle cx="30" cy="6" r="3.2" fill="var(--color-accent)" stroke="var(--color-background-surface)" strokeWidth="1.5" />
                        )}
                        {hasOpen && (
                          <circle cx="6" cy="6" r="3.2" fill="var(--color-background-surface)" stroke="var(--color-warning)" strokeWidth="1.8" />
                        )}
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
      {selectedEpisode ? <VStack gap={3}>
        <HStack gap={3} align="center" justify="between" wrap="wrap">
          <HStack gap={3} align="center">
            {selectedPerson && <CharacterAvatar project={project} character={selectedPerson} size={40} decorative />}
            <VStack gap={0.5}>
              <Heading level={3}>
                {selectedPerson ? `${selectedPerson.name} · ${episodeCode(selectedEpisode)}` : `${episodeCode(selectedEpisode)} · every record`}
              </Heading>
              <Text type="supporting" color="secondary">
                {selectedEpisode.title}{selectedPerson && selectedPerson.source.episodeId === selectedEpisode.id ? ' · introduced in this episode' : ''}
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
          empty={selectedPerson ? `${selectedPerson.name} has no records in this episode.` : 'No records in this episode.'}
        />
      </VStack> : (
        <Text type="supporting" color="secondary">
          Choose a character and episode to list the interactions, turns and reveals behind it, each linked to its exact script line.
        </Text>
      )}
    </Card>
  </Pane>;
}
