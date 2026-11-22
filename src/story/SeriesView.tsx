import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Link } from '@astryxdesign/core/Link';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clapperboard, Download, GitBranch, LayoutGrid,
  Network, Plus, Sparkles, Trash2, Users
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { newId, sceneList } from '../model';
import type { Asset, DocumentModel, Project, WorkspaceViewProps } from '../model';
import { PhotoDrop } from '../production/media';
import { addAssets, removeAssets } from '../production/photos';
import { PageHeader } from '../shell/PageHeader';
import { ArcTimeline } from './ArcTimeline';
import { CharacterDossier } from './CharacterDossier';
import type { DossierPane } from './CharacterDossier';
import { MajorEventsTimeline } from './MajorEventsTimeline';
import { RelationshipWeb } from './RelationshipWeb';
import { StoryMap } from './StoryMap';
import { downloadText, episodeCode, fields, fileStem, orderedEpisodes, sourceDocument, sourceText } from './source';
import {
  canonStates, characterSummaryStats, flashbacks, scanSeriesScripts, storyChecks
} from './series-analysis';
import {
  approveCanon, CHARACTER_BILLINGS, CHARACTER_STATUSES, continuityConflicts, getStory, KNOWLEDGE,
  queryStory, RELATIONSHIPS, relationshipStates, reviewException, saveCharacter, saveStoryPoint, sceneMatrix, sortStory, STORY_KINDS
} from './series-model';
import type { Character, CharacterStatus, KnowledgeState, RelationshipState, SceneMatrixRow, StoryKind, StoryPoint, StoryState } from './series-model';
import { Choice, Empty, FormError, Glyph, initialSource, Pane, SourceButton, SourceFields, Split, StoryDialog } from './StoryControls';
import { CanonBadge, CharacterAvatar, EpisodeChip, PointRows, typeLabels } from './StoryParts';
import type { CanonLookup } from './StoryParts';

const PANES = ['Relationship web', 'Story map', 'Event ledger', 'Characters', 'Scene matrix', 'Arcs and continuity'] as const;
type View = (typeof PANES)[number];

const PANE_ICONS: Record<View, typeof Network> = {
  'Relationship web': Network,
  'Story map': LayoutGrid,
  'Event ledger': CalendarClock,
  Characters: Users,
  'Scene matrix': Clapperboard,
  'Arcs and continuity': GitBranch
};

const viewSlug = (pane: View) => pane.toLowerCase().replace(/[^a-z0-9]+/g, '-');

interface EditorProps {
  project: Project;
  document: DocumentModel;
  close: () => void;
}

function CharacterFormDialog({ project, document, character, save, onPhotoUpdate, close }: EditorProps & {
  character?: Character;
  save: (character: Character) => boolean;
  onPhotoUpdate: (added: Asset[], removedIds: ReadonlyArray<string | undefined>) => void;
}) {
  const [name, setName] = useState(character?.name ?? '');
  const [role, setRole] = useState(character?.role ?? '');
  const [billing, setBilling] = useState(character?.billing ?? 'Series regular');
  const [status, setStatus] = useState<CharacterStatus>(character?.status ?? 'Active');
  const [bio, setBio] = useState(character?.bio ?? '');
  const [motivation, setMotivation] = useState(character?.motivation ?? '');
  const [conflict, setConflict] = useState(character?.conflict ?? '');
  const [notes, setNotes] = useState(character?.notes ?? '');
  const [aliases, setAliases] = useState(character?.aliases.join('\n') ?? '');
  const [photoAssetId, setPhotoAssetId] = useState(character?.photoAssetId);
  const [assetIds, setAssetIds] = useState<string[]>(character?.assetIds ?? []);
  const [source, setSource] = useState(character?.source ?? initialSource(project, document));
  const [error, setError] = useState('');

  const previewCharacter: Character = {
    id: character?.id ?? 'preview',
    name: name.trim() || 'Character',
    role,
    motivation,
    conflict,
    aliases: fields(aliases),
    source: source ?? initialSource(project, document)!,
    photoAssetId,
    portraitUrl: character?.portraitUrl
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !source) {
      setError('Enter a name and choose an exact source line.');
      return;
    }
    if (save({
      id: character?.id ?? newId(),
      name: name.trim(),
      role: role.trim(),
      billing: billing.trim() || undefined,
      status,
      bio: bio.trim() || undefined,
      motivation: motivation.trim(),
      conflict: conflict.trim(),
      notes: notes.trim() || undefined,
      aliases: fields(aliases),
      photoAssetId,
      portraitUrl: character?.portraitUrl,
      assetIds: assetIds.length ? assetIds : undefined,
      source
    })) close();
  }

  return <StoryDialog
    title={character ? `Edit ${character.name}` : 'Add character'}
    subtitle="Characters stay anchored to the exact script line where the audience first meets them."
    width={760}
    onClose={close}
  >
    <HStack gap={5} align="start" wrap="wrap">
      <VStack as="aside" gap={3} width={200} hAlign="start">
        <CharacterAvatar project={project} character={previewCharacter} size={96} shape="rounded" />
        <PhotoDrop
          label={photoAssetId ? 'Replace portrait' : 'Upload portrait'}
          description="PNG or JPEG · resized to 512px"
          onAssets={assets => {
            const added = assets[0];
            if (!added) return;
            onPhotoUpdate(assets, photoAssetId ? [photoAssetId] : []);
            setPhotoAssetId(added.id);
          }}
        />
        {photoAssetId && (
          <Link onClick={() => {
            onPhotoUpdate([], [photoAssetId]);
            setPhotoAssetId(undefined);
          }}>
            <Glyph icon={Trash2} size="xsm" /> Remove portrait
          </Link>
        )}
      </VStack>

      <VStack as="form" gap={3} onSubmit={submit} style={{ flex: '1 1 22rem', minWidth: 0 }}>
        <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
          <TextInput label="Name" value={name} onChange={setName} isRequired />
          <TextInput label="Role" value={role} onChange={setRole} placeholder="Producer, Journalist, Detective" />
          <Choice
            label="Billing"
            value={billing}
            onChange={setBilling}
            options={CHARACTER_BILLINGS.map(value => ({ value, label: value }))}
          />
          <Choice
            label="Status"
            value={status}
            onChange={value => setStatus(value as CharacterStatus)}
            options={CHARACTER_STATUSES.map(value => ({ value, label: value }))}
          />
        </Grid>
        <TextArea label="Character overview" value={bio} onChange={setBio} rows={2} placeholder="One-sentence summary of who they are when the series begins." />
        <TextArea label="Core motivation" value={motivation} onChange={setMotivation} rows={2} />
        <TextArea label="Conflict" value={conflict} onChange={setConflict} rows={2} />
        <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
          <TextArea label="Aliases, one per line" value={aliases} onChange={setAliases} rows={2} />
          <TextArea label="Writer notes" value={notes} onChange={setNotes} rows={2} />
        </Grid>
        <SourceFields project={project} value={source} onChange={setSource} />
        {project.assets.length > 0 && <CheckboxList
          label="Attached project files"
          density="compact"
          value={assetIds}
          onChange={setAssetIds}
        >
          {project.assets.filter(asset => asset.id !== photoAssetId).slice(0, 8).map(asset => (
            <CheckboxListItem key={asset.id} value={asset.id} label={asset.name} />
          ))}
        </CheckboxList>}
        <FormError>{error}</FormError>
        <HStack gap={2} justify="end">
          <Button label="Cancel" onClick={close} />
          <Button type="submit" variant="primary" label="Save character" isDisabled={!source || !name.trim()} />
        </HStack>
      </VStack>
    </HStack>
  </StoryDialog>;
}

function PointFormDialog({ project, document, data, point, save, close }: EditorProps & {
  data: StoryState;
  point?: StoryPoint;
  save: (point: StoryPoint) => boolean;
}) {
  const [kind, setKind] = useState<StoryKind>(point?.kind ?? 'event');
  const [storyOrder, setStoryOrder] = useState<number>(point?.storyOrder ?? 10);
  const [title, setTitle] = useState(point?.title ?? '');
  const [detail, setDetail] = useState(point?.detail ?? '');
  const [source, setSource] = useState(point?.source ?? initialSource(project, document));
  const [people, setPeople] = useState<string[]>(point?.participants ?? []);
  const [relationship, setRelationship] = useState<RelationshipState>(point?.relationship ?? 'Trust');
  const [factKey, setFactKey] = useState(point?.factKey ?? '');
  const [knowledge, setKnowledge] = useState<KnowledgeState>(point?.knowledge ?? 'Confirmed');
  const [causeId, setCauseId] = useState(point?.causeId ?? '');
  const [error, setError] = useState('');

  const episodes = orderedEpisodes(project);
  const reveal = episodes.findIndex(episode => episode.id === source?.episodeId);
  const characterOptions = data.characters.filter(person => episodes.findIndex(episode => episode.id === person.source.episodeId) <= reveal);
  const events = data.points.filter(event => event.kind === 'event' && event.id !== point?.id);
  const minPeople = kind === 'event' ? 0 : kind === 'relationship' || kind === 'interaction' ? 2 : 1;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!source || !title.trim()) {
      setError('Enter a title and choose an exact source line.');
      return;
    }
    const ok = save({
      id: point?.id ?? newId(),
      kind,
      title: title.trim(),
      detail: detail.trim(),
      source,
      storyOrder: Number.isFinite(storyOrder) ? storyOrder : 1,
      participants: people.filter(id => characterOptions.some(person => person.id === id)),
      relationship: kind === 'relationship' ? relationship : undefined,
      knowledge: kind === 'knowledge' ? knowledge : undefined,
      factKey: kind === 'knowledge' ? factKey.trim() : undefined,
      causeId: kind === 'event' || kind === 'arc' ? causeId || undefined : undefined
    });
    if (ok) close();
  }

  return <StoryDialog
    title={point ? 'Edit story record' : 'Add story record'}
    subtitle="The script line controls when the audience learns it; story order controls chronology."
    width={680}
    onClose={close}
  >
    <VStack as="form" gap={3} onSubmit={submit}>
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <Choice
          label="Record type"
          value={kind}
          onChange={value => setKind(value as StoryKind)}
          options={STORY_KINDS.map(item => ({ value: item, label: typeLabels[item] }))}
        />
        <NumberInput
          label="Story time order"
          description="Use a lower number for a flashback."
          value={storyOrder}
          onChange={value => setStoryOrder(Number(value) || 0)}
        />
      </Grid>
      <TextInput label={kind === 'knowledge' ? 'Fact or open question' : 'Title'} value={title} onChange={setTitle} isRequired />
      <TextArea label="Detail" value={detail} onChange={setDetail} rows={2} />
      <SourceFields project={project} value={source} onChange={setSource} />
      {characterOptions.length > 0 && <CheckboxList
        label={`Characters${minPeople ? ` · Select ${minPeople}` : ''}`}
        density="compact"
        value={people}
        onChange={setPeople}
      >
        {characterOptions.map(person => (
          <CheckboxListItem key={person.id} value={person.id} label={person.name} description={person.role || undefined} />
        ))}
      </CheckboxList>}
      {kind === 'relationship' && <Choice
        label="Relationship state"
        value={relationship}
        onChange={value => setRelationship(value as RelationshipState)}
        options={RELATIONSHIPS.map(state => ({ value: state, label: state }))}
      />}
      {kind === 'knowledge' && <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <TextInput label="Shared fact key" value={factKey} onChange={setFactKey} placeholder="e.g. timetable-date" isRequired />
        <Choice
          label="State of knowledge"
          value={knowledge}
          onChange={value => setKnowledge(value as KnowledgeState)}
          options={KNOWLEDGE.map(state => ({ value: state, label: state }))}
        />
      </Grid>}
      {(kind === 'event' || kind === 'arc') && events.length > 0 && <Choice
        label="Caused by"
        value={causeId}
        onChange={setCauseId}
        options={[{ value: '', label: 'No recorded cause' }, ...events.map(event => ({ value: event.id, label: event.title }))]}
      />}
      <FormError>{error}</FormError>
      <HStack gap={2} justify="end">
        <Button label="Cancel" onClick={close} />
        <Button type="submit" variant="primary" label="Save record" isDisabled={!source || !title.trim()} />
      </HStack>
    </VStack>
  </StoryDialog>;
}

function ScriptScanDialog({ project, draft, onImport, close }: {
  project: Project;
  draft: StoryState;
  onImport: (characters: Character[], points: StoryPoint[]) => void;
  close: () => void;
}) {
  const scan = useMemo(() => scanSeriesScripts(project, draft), [draft, project]);
  const [chosenChars, setChosenChars] = useState<string[]>(() => scan.newCharacters.map(item => item.cueName));
  const [chosenApps, setChosenApps] = useState<string[]>(() => scan.newAppearances.slice(0, 12).map((_, i) => String(i)));

  function apply() {
    const newCharacters: Character[] = scan.newCharacters
      .filter(item => chosenChars.includes(item.cueName))
      .map(item => ({
        id: newId(),
        name: item.name,
        role: '',
        billing: item.episodes >= 3 ? 'Series regular' : 'Recurring',
        status: 'Active',
        motivation: '',
        conflict: '',
        aliases: item.cueName.toLowerCase() !== item.name.toLowerCase() ? [item.cueName] : [],
        source: item.source
      }));
    const newPoints: StoryPoint[] = scan.newAppearances
      .filter((_, index) => chosenApps.includes(String(index)))
      .map(item => ({
        id: newId(),
        kind: 'appearance',
        title: item.title,
        detail: `${item.characterName} speaks in ${item.sceneHeading}.`,
        participants: [item.characterId],
        source: item.source,
        storyOrder: item.storyOrder
      }));
    onImport(newCharacters, newPoints);
    close();
  }

  const totalSelected = chosenChars.length + chosenApps.length;

  return <StoryDialog
    title="Scan scripts for characters & appearances"
    subtitle="Reads speaking cues from every episode script and anchors each imported record to its exact line in your working draft."
    width={680}
    onClose={close}
  >
    {!scan.newCharacters.length && !scan.newAppearances.length ? (
      <Empty
        title="Scripts are already in sync"
        description="Every speaking character and scene appearance found across your episodes is already recorded in Series Intelligence."
      />
    ) : <VStack gap={4}>
      {scan.newCharacters.length > 0 && <CheckboxList
        label={`Unrecorded speaking characters (${scan.newCharacters.length})`}
        density="compact"
        value={chosenChars}
        onChange={setChosenChars}
      >
        {scan.newCharacters.map(item => (
          <CheckboxListItem
            key={item.cueName}
            value={item.cueName}
            label={item.name}
            description={`First speaks in ${item.firstEpisodeLabel} · ${item.speeches} speech${item.speeches === 1 ? '' : 'es'} across ${item.episodes} episode${item.episodes === 1 ? '' : 's'}`}
          />
        ))}
      </CheckboxList>}
      {scan.newAppearances.length > 0 && <CheckboxList
        label={`Unrecorded scene appearances (${scan.newAppearances.length})`}
        density="compact"
        value={chosenApps}
        onChange={setChosenApps}
      >
        {scan.newAppearances.slice(0, 20).map((item, idx) => (
          <CheckboxListItem
            key={`${item.characterId}-${idx}`}
            value={String(idx)}
            label={`${item.episodeLabel} · ${item.characterName}`}
            description={item.sceneHeading}
          />
        ))}
      </CheckboxList>}
      <HStack gap={2} justify="end">
        <Button label="Cancel" onClick={close} />
        <Button
          variant="primary"
          icon={<Glyph icon={Sparkles} />}
          label={`Import ${totalSelected} record${totalSelected === 1 ? '' : 's'} to draft`}
          isDisabled={totalSelected === 0}
          onClick={apply}
        />
      </HStack>
    </VStack>}
  </StoryDialog>;
}

/** Dual-axis reveal-order vs. story-time chronology ribbon with explicit fill="none" paths so flashbacks read cleanly. */
function Chronology({ project, events, flags, activeId, onSelect }: {
  project: Project;
  events: StoryPoint[];
  flags: Map<string, string>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (events.length < 2) return null;
  const reveal = sortStory(project, events, 'reveal');
  const story = sortStory(project, events, 'story');
  const episodes = orderedEpisodes(project);
  const epLabel = (point: StoryPoint) => {
    const ep = episodes.find(item => item.id === point.source.episodeId);
    return ep ? episodeCode(ep) : '';
  };
  const x = (index: number) => 36 + index * (928 / (events.length - 1));
  const storyIndex = new Map(story.map((point, index) => [point.id, index]));

  return <Card variant="muted" padding={4}>
    <VStack gap={2}>
      <HStack justify="between" align="center" wrap="wrap">
        <Text type="label" color="secondary">Reveal order · episode and line</Text>
        <Text type="supporting" color="secondary" size="xsm">Click any node to highlight its event below</Text>
      </HStack>
      <svg
        viewBox="0 0 1000 132"
        role="img"
        aria-label={`${events.length} events. ${flags.size} revealed out of story order.`}
        style={{ width: '100%', height: '124px', display: 'block' }}
      >
        <line x1="36" x2="964" y1="30" y2="30" stroke="var(--color-border-emphasized)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1="36" x2="964" y1="102" y2="102" stroke="var(--color-border-emphasized)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {reveal.map((point, index) => {
          const target = storyIndex.get(point.id) ?? index;
          const out = flags.has(point.id);
          const selected = activeId === point.id;
          const x1 = x(index);
          const x2 = x(target);
          const stroke = out ? 'var(--color-warning)' : 'var(--color-accent)';
          return <g
            key={point.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(selected ? '' : point.id)}
          >
            <title>{`${epLabel(point)} · ${point.title}`}</title>
            <path
              d={`M ${x1} 30 C ${x1} 66, ${x2} 66, ${x2} 102`}
              fill="none"
              stroke={stroke}
              strokeWidth={selected ? 3.6 : out ? 2.6 : 1.6}
              strokeDasharray={out ? '6 3' : undefined}
              opacity={activeId && !selected ? 0.25 : 0.92}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x1}
              cy="30"
              r={selected ? 6.5 : 5}
              fill={stroke}
              stroke="var(--color-background-surface)"
              strokeWidth="2"
            />
            <circle
              cx={x2}
              cy="102"
              r={selected ? 6.5 : 5}
              fill={stroke}
              stroke="var(--color-background-surface)"
              strokeWidth="2"
            />
            {events.length <= 12 && (
              <text
                x={x1}
                y="16"
                textAnchor="middle"
                fill={selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'}
                fontSize="10.5"
                fontWeight={selected || out ? '700' : '500'}
                fontFamily="var(--font-family-body)"
              >
                {epLabel(point)}
              </text>
            )}
          </g>;
        })}
      </svg>
      <HStack gap={2} align="center" wrap="wrap">
        <Text type="label" color="secondary">Story time · chronology</Text>
        {flags.size > 0 && <Token size="sm" color="yellow" label="Dashed amber lines cross back in time" />}
      </HStack>
    </VStack>
  </Card>;
}

function ConflictReviewForm({ defaultValue, onSave }: { defaultValue?: string; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState(defaultValue ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim()) onSave(reason.trim());
  }
  return <HStack as="form" gap={2} align="end" wrap="wrap" onSubmit={submit}>
    <TextInput
      label="Exception reason"
      isLabelHidden
      placeholder="Why this is intentional"
      value={reason}
      onChange={setReason}
      isRequired
      width={300}
    />
    <Button type="submit" size="sm" label="Save review" isDisabled={!reason.trim()} />
  </HStack>;
}

interface MatrixTableRow extends Record<string, unknown> {
  id: string;
  row: SceneMatrixRow;
}

interface CharacterTableRow extends Record<string, unknown> {
  id: string;
  character: Character;
}

export function SeriesView({
  project,
  document,
  onProjectChange,
  onOpenSource,
  onStatus,
  readOnly,
  tab,
  onTabChange,
  characterId,
  onCharacterChange
}: WorkspaceViewProps & {
  /** The series workspace named in the address, e.g. story-map. */
  tab?: string;
  onTabChange?: (tab: string) => void;
  /** Optional deep-linked character dossier id from the route or command palette. */
  characterId?: string;
  onCharacterChange?: (characterId?: string) => void;
}) {
  const episodes = orderedEpisodes(project);
  const current = episodes.find(item => item.id === document.episodeId);
  const [season, setSeason] = useState(current?.season ?? 0);
  const [exact, setExact] = useState('');
  const [asOf, setAsOf] = useState(current?.id ?? '');
  const [version, setVersion] = useState('');
  const [localView, setLocalView] = useState<View>(() => PANES.find(pane => viewSlug(pane) === tab) ?? 'Relationship web');
  const view = onTabChange ? PANES.find(pane => viewSlug(pane) === tab) ?? 'Relationship web' : localView;
  const setView = (next: View) => {
    setLocalView(next);
    onTabChange?.(viewSlug(next));
  };

  const [focusedPerson, setFocusedPerson] = useState(characterId ?? '');
  const [dossier, setDossierState] = useState(Boolean(characterId));
  const [seenCharacterId, setSeenCharacterId] = useState(characterId);
  if (characterId !== seenCharacterId) {
    setSeenCharacterId(characterId);
    if (characterId) {
      setFocusedPerson(characterId);
      setDossierState(true);
    } else {
      setDossierState(false);
    }
  }
  const setDossier = (open: boolean, nextPersonId?: string) => {
    setDossierState(open);
    if (nextPersonId) setFocusedPerson(nextPersonId);
    onCharacterChange?.(open ? (nextPersonId ?? focusedPerson) : undefined);
  };

  const [dossierPane, setDossierPane] = useState<DossierPane>('Overview');
  const [order, setOrder] = useState<'reveal' | 'story'>('reveal');
  const [characterSearch, setCharacterSearch] = useState('');
  const [characterLayout, setCharacterLayout] = useState<'cards' | 'table'>('cards');
  const [highlightedEventId, setHighlightedEventId] = useState('');
  const [form, setForm] = useState<{ kind: 'character'; item?: Character } | { kind: 'point'; item?: StoryPoint } | { kind: 'scan' }>();
  const [error, setError] = useState('');

  const store = useMemo(() => getStory(project), [project]);
  const canon = version === 'draft' ? undefined : store.canon.find(item => item.id === version) ?? store.canon.at(-1);
  const scope = { season: season || undefined, episodeId: exact || undefined, asOfId: asOf || undefined };
  const data = queryStory(project, canon?.data ?? store.draft, scope);
  const editable = !readOnly && !canon;
  const person = data.characters.find(item => item.id === focusedPerson) ?? data.characters[0];
  const edges = relationshipStates(project, data.points);
  const eventRows = sortStory(project, data.points.filter(point => point.kind === 'event'), order);
  const interactions = sortStory(project, data.points.filter(point => point.kind === 'interaction' && point.participants.includes(person?.id ?? '')), 'reveal').reverse();
  const selectPerson = (id: string) => setFocusedPerson(id);
  const episodeOf = (item: Character) => {
    const episode = episodes.find(entry => entry.id === item.source.episodeId);
    return episode ? episodeCode(episode) : 'in script';
  };
  const setEditPoint = editable ? (point: StoryPoint) => setForm({ kind: 'point', item: point }) : undefined;
  const displayDossier = dossier && Boolean(person);
  const canonLookup: CanonLookup = canon ? undefined : canonStates(store);
  const cutoffIndex = asOf ? episodes.findIndex(item => item.id === asOf) : episodes.length - 1;
  const scopeEpisodes = episodes.filter(item => (!season || item.season === season) && (!exact || item.id === exact));
  const revealedEpisodes = scopeEpisodes.filter(item => episodes.indexOf(item) <= cutoffIndex);
  const flashbackFlags = new Map([...flashbacks(project, data.points)].map(id => [id, 'Revealed out of order'] as const));
  const conflicts = continuityConflicts(data.points);
  const checks = storyChecks(project, data, revealedEpisodes);
  const draftCount = canonLookup ? [...canonLookup.values()].filter(state => state !== 'approved').length : 0;

  function change(action: (p: Project) => Project, message: string): boolean {
    try {
      onProjectChange(action);
      setError('');
      onStatus(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The story record could not be saved.');
      return false;
    }
  }

  function openDossier(targetId?: string) {
    setDossierPane('Overview');
    setDossier(true, targetId ?? person?.id);
  }

  function exportVisible() {
    const content = { projectId: project.id, scope, canonId: canon?.id, data };
    downloadText(`${fileStem(project.title)}-visible-story.json`, JSON.stringify(content, null, 2), 'application/json');
    onStatus('Visible story records exported.');
  }

  const seasonOptions = [
    { value: '0', label: 'All seasons' },
    ...[...new Set(episodes.map(item => item.season))].map(key => ({ value: String(key), label: `Season ${key}` }))
  ];
  const asOfOptions = [
    { value: '', label: 'Latest in scope' },
    ...episodes.filter(item => !season || item.season === season).map(item => ({ value: item.id, label: `As of ${episodeCode(item)}` }))
  ];
  const episodeFilterOptions = [
    { value: '', label: 'All visible episodes' },
    ...episodes
      .filter((item, index) => (!season || item.season === season) && (!asOf || index <= episodes.findIndex(ep => ep.id === asOf)))
      .map(item => ({ value: item.id, label: `${episodeCode(item)} · ${item.title}` }))
  ];
  const versionOptions = [
    { value: 'draft', label: 'Working draft' },
    ...store.canon.map(item => ({ value: item.id, label: item.label }))
  ];

  const orderToggle = <SegmentedControl label="Event order" size="sm" value={order} onChange={value => setOrder(value as 'reveal' | 'story')}>
    <SegmentedControlItem value="reveal" label="Reveal order" />
    <SegmentedControlItem value="story" label="Story time" />
  </SegmentedControl>;

  const filteredCharacters = data.characters.filter(item => {
    const needle = characterSearch.trim().toLocaleLowerCase('en-GB');
    if (!needle) return true;
    return [item.name, item.role, item.billing, item.motivation, ...item.aliases].some(value => value?.toLocaleLowerCase('en-GB').includes(needle));
  });

  const matrixRows = sceneMatrix(data.points);
  const sceneHeadingFor = (row: SceneMatrixRow) => {
    const doc = sourceDocument(project, row.source);
    return doc ? sceneList(doc).find(scene => scene.id === row.source.sceneId)?.heading : undefined;
  };

  return <VStack gap={5} id="main-content" className="swdr-page" aria-label="Series Intelligence workspace">
    <PageHeader
      eyebrow={`${project.title} — ${season ? `Season ${season}` : 'All seasons'}`}
      title={displayDossier && person ? person.name : 'Series Intelligence'}
      subtitle={displayDossier && person
        ? [person.role, 'Character dossier'].filter(Boolean).join(' · ')
        : `${canon ? 'Approved canon' : 'Working draft'} · ${project.title}`}
      actions={<HStack gap={2} align="center" wrap="wrap">
        <Choice
          label="Season"
          isLabelHidden
          size="sm"
          width={145}
          value={String(season)}
          onChange={value => { setSeason(Number(value)); setExact(''); setAsOf(''); }}
          options={seasonOptions}
        />
        <Choice
          label="As of episode"
          isLabelHidden
          size="sm"
          width={184}
          value={asOf}
          onChange={value => { setAsOf(value); setExact(''); }}
          options={asOfOptions}
        />
        {displayDossier && (
          <Button
            size="sm"
            label="Relationship web"
            icon={<Glyph icon={Network} size="xsm" />}
            onClick={() => { setDossier(false); setView('Relationship web'); }}
          />
        )}
      </HStack>}
    />

    {!canon && draftCount > 0 && (
      <Banner
        status="warning"
        title={`${draftCount} record${draftCount === 1 ? '' : 's'} not yet approved as canon`}
        description="Working draft records carry a draft tag and stay separate from approved canon snapshots until you approve them."
        endContent={editable ? (
          <Button
            variant="primary"
            size="sm"
            label="Approve canon"
            icon={<Glyph icon={CheckCircle2} size="xsm" />}
            isDisabled={!store.draft.points.length && !store.draft.characters.length}
            onClick={() => {
              if (change(approveCanon, 'Approved canon snapshot saved.')) setVersion('');
            }}
          />
        ) : undefined}
      />
    )}

    <VStack gap={3}>
      {!displayDossier && (
        <TabList value={view} onChange={value => setView(value as View)} hasDivider aria-label="Series workspaces">
          {PANES.map(pane => (
            <Tab
              key={pane}
              value={pane}
              label={pane}
              icon={<Glyph icon={PANE_ICONS[pane]} size="sm" />}
              endContent={pane === 'Characters' && data.characters.length > 0 ? <Badge variant="neutral" label={String(data.characters.length)} />
                : pane === 'Arcs and continuity' && conflicts.length > 0 ? <Badge variant="warning" label={String(conflicts.length)} />
                : undefined}
            />
          ))}
        </TabList>
      )}

      <HStack gap={2} align="center" justify="between" wrap="wrap">
        <HStack gap={2} align="center" wrap="wrap">
          <Choice
            label="Episode filter"
            isLabelHidden
            size="sm"
            width={210}
            value={exact}
            onChange={setExact}
            options={episodeFilterOptions}
          />
          <Choice
            label="Canon or draft"
            isLabelHidden
            size="sm"
            width={160}
            value={canon?.id ?? 'draft'}
            onChange={value => { setVersion(value); setForm(undefined); }}
            options={versionOptions}
          />
          <Button size="sm" label="Export visible story" icon={<Glyph icon={Download} size="xsm" />} onClick={exportVisible} />
        </HStack>

        {editable && <HStack gap={2} align="center" wrap="wrap">
          <Button size="sm" label="Scan scripts" icon={<Glyph icon={Sparkles} size="xsm" />} onClick={() => setForm({ kind: 'scan' })} />
          <Button
            size="sm"
            label={displayDossier ? 'Edit character' : 'Add character'}
            icon={<Glyph icon={Plus} size="xsm" />}
            onClick={() => setForm({ kind: 'character', item: displayDossier ? person : undefined })}
          />
          <Button size="sm" label="Add record" icon={<Glyph icon={Plus} size="xsm" />} onClick={() => setForm({ kind: 'point' })} />
          <Button
            size="sm"
            variant="primary"
            label="Approve canon"
            isDisabled={!store.draft.points.length && !store.draft.characters.length}
            onClick={() => {
              if (change(approveCanon, 'Approved canon snapshot saved.')) setVersion('');
            }}
          />
        </HStack>}
      </HStack>
    </VStack>

    <FormError>{error}</FormError>

    {form?.kind === 'character' && (
      <CharacterFormDialog
        key={form.item?.id ?? 'new-character'}
        project={project}
        document={document}
        character={form.item}
        close={() => setForm(undefined)}
        onPhotoUpdate={(added, removed) => {
          onProjectChange(currentProject => removeAssets(addAssets(currentProject, added), removed));
        }}
        save={character => {
          const saved = change(p => saveCharacter(p, character), 'Character saved.');
          if (saved) setFocusedPerson(character.id);
          return saved;
        }}
      />
    )}

    {form?.kind === 'point' && (
      <PointFormDialog
        key={form.item?.id ?? 'new-record'}
        project={project}
        document={document}
        data={store.draft}
        point={form.item}
        close={() => setForm(undefined)}
        save={point => change(p => saveStoryPoint(p, point), 'Story record saved.')}
      />
    )}

    {form?.kind === 'scan' && (
      <ScriptScanDialog
        project={project}
        draft={store.draft}
        close={() => setForm(undefined)}
        onImport={(newChars, newPoints) => {
          change(currentProject => {
            let next = currentProject;
            for (const character of newChars) next = saveCharacter(next, character);
            for (const point of newPoints) next = saveStoryPoint(next, point);
            return next;
          }, `Imported ${newChars.length + newPoints.length} script records to working draft.`);
        }}
      />
    )}

    {displayDossier && person ? (
      <CharacterDossier
        project={project}
        person={person}
        data={data}
        states={edges}
        active={dossierPane}
        episodes={revealedEpisodes}
        setActive={setDossierPane}
        onOpen={onOpenSource}
        onEdit={setEditPoint}
        onEditCharacter={editable ? () => setForm({ kind: 'character', item: person }) : undefined}
        onSelectPerson={id => { selectPerson(id); openDossier(id); }}
        canon={canonLookup}
      />
    ) : <>
      {view === 'Relationship web' && <VStack gap={5}>
        <RelationshipWeb
          project={project}
          person={person}
          characters={data.characters}
          edges={edges}
          interactions={interactions}
          points={data.points}
          select={selectPerson}
          dossier={() => openDossier()}
          onOpen={onOpenSource}
          states={canonLookup}
        />
        <MajorEventsTimeline
          project={project}
          events={eventRows}
          characters={data.characters}
          order={order}
          onOrderChange={setOrder}
          flashbackFlags={flashbackFlags}
          states={canonLookup}
          onOpen={onOpenSource}
          onOpenLedger={() => setView('Event ledger')}
        />
      </VStack>}

      {view === 'Story map' && (
        <StoryMap
          project={project}
          data={data}
          episodes={scopeEpisodes}
          cutoff={cutoffIndex}
          onOpen={onOpenSource}
          states={canonLookup}
          onDossier={id => { selectPerson(id); openDossier(id); }}
        />
      )}

      {view === 'Event ledger' && <Pane
        title="Event ledger"
        label="Event ledger"
        description={`${order === 'reveal' ? 'Ordered by the episode and line where the audience learns each event.' : 'Ordered by when each event happens in the world of the story.'}${flashbackFlags.size > 0 ? ` ${flashbackFlags.size} event${flashbackFlags.size === 1 ? ' is' : 's are'} revealed out of story order.` : ''}`}
        actions={orderToggle}
        padding={5}
      >
        <Chronology
          project={project}
          events={eventRows}
          flags={flashbackFlags}
          activeId={highlightedEventId}
          onSelect={setHighlightedEventId}
        />
        <PointRows
          rows={highlightedEventId ? eventRows.filter(point => point.id === highlightedEventId) : eventRows}
          project={project}
          onOpen={onOpenSource}
          onEdit={setEditPoint}
          empty="No events in this view."
          flags={flashbackFlags}
          states={canonLookup}
          people={data.characters}
        />
        {highlightedEventId && <HStack justify="start">
          <Button size="sm" variant="ghost" label="Show all events" onClick={() => setHighlightedEventId('')} />
        </HStack>}
      </Pane>}

      {view === 'Characters' && <Pane
        title="Characters"
        description={`${data.characters.length} character${data.characters.length === 1 ? '' : 's'} visible in this scope`}
        actions={<HStack gap={2} align="center" wrap="wrap">
          <TextInput
            label="Search characters"
            isLabelHidden
            type="search"
            size="sm"
            width={220}
            placeholder="Search name, role or alias"
            hasClear
            value={characterSearch}
            onChange={setCharacterSearch}
          />
          <SegmentedControl label="Character layout" size="sm" value={characterLayout} onChange={value => setCharacterLayout(value as 'cards' | 'table')}>
            <SegmentedControlItem value="cards" label="Cards" />
            <SegmentedControlItem value="table" label="Table" />
          </SegmentedControl>
        </HStack>}
        padding={5}
      >
        {filteredCharacters.length > 0 ? (
          characterLayout === 'cards' ? (
            <Grid columns={{ minWidth: 260, repeat: 'fill' }} gap={4}>
              {filteredCharacters.map(item => {
                const stats = characterSummaryStats(project, data, item.id);
                return <Card role="article" key={item.id} variant="muted" padding={4}>
                  <VStack gap={3} minHeight="100%" justify="between">
                    <VStack gap={2}>
                      <HStack gap={3} align="center">
                        <CharacterAvatar project={project} character={item} size={60} shape="rounded" decorative />
                        <VStack gap={0.5} style={{ minWidth: 0, flex: 1 }}>
                          <HStack gap={1.5} align="center" wrap="wrap">
                            <Heading level={3}>{item.name}</Heading>
                            {item.status && <Badge variant={item.status === 'Active' ? 'success' : 'neutral'} label={item.status} />}
                          </HStack>
                          <Text type="supporting" color="secondary" size="sm">
                            {[item.role || 'Character', item.billing].filter(Boolean).join(' · ')}
                          </Text>
                        </VStack>
                      </HStack>
                      {(item.bio || item.motivation) && (
                        <Text type="supporting" color="secondary" maxLines={2}>{item.bio || item.motivation}</Text>
                      )}
                      <HStack gap={2} align="center" wrap="wrap">
                        <Token size="sm" color="blue" label={`Introduced ${episodeOf(item)}`} />
                        <Text type="supporting" color="secondary" size="xsm">
                          {stats.records} record{stats.records === 1 ? '' : 's'} · {stats.relationships} link{stats.relationships === 1 ? '' : 's'}
                        </Text>
                        <CanonBadge id={item.id} states={canonLookup} />
                      </HStack>
                    </VStack>

                    <HStack gap={2} align="center" justify="between" wrap="wrap">
                      <Button size="sm" variant="primary" label="Open dossier" onClick={() => { selectPerson(item.id); openDossier(item.id); }} />
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Focus in web"
                        onClick={() => { selectPerson(item.id); setView('Relationship web'); }}
                      />
                    </HStack>
                  </VStack>
                </Card>;
              })}
            </Grid>
          ) : (
            <Table<CharacterTableRow>
              density="compact"
              hasHover
              idKey="id"
              data={filteredCharacters.map(character => ({ id: character.id, character }))}
              columns={[
                {
                  key: 'character',
                  header: 'Character',
                  width: proportional(3, { minWidth: 200 }),
                  renderCell: ({ character }) => (
                    <HStack gap={3} align="center">
                      <CharacterAvatar project={project} character={character} size={36} decorative />
                      <VStack gap={0} hAlign="start">
                        <Link onClick={() => { selectPerson(character.id); openDossier(character.id); }}>
                          <Text weight="semibold">{character.name}</Text>
                        </Link>
                        <Text type="supporting" color="secondary" size="xsm">{character.role || 'Character'}</Text>
                      </VStack>
                    </HStack>
                  )
                },
                {
                  key: 'intro',
                  header: 'Introduced',
                  width: pixel(104),
                  renderCell: ({ character }) => <EpisodeChip project={project} episodeId={character.source.episodeId} />
                },
                {
                  key: 'records',
                  header: 'Records',
                  width: pixel(84),
                  align: 'end',
                  renderCell: ({ character }) => <Text weight="semibold">{characterSummaryStats(project, data, character.id).records}</Text>
                },
                {
                  key: 'links',
                  header: 'Links',
                  width: pixel(76),
                  align: 'end',
                  renderCell: ({ character }) => characterSummaryStats(project, data, character.id).relationships
                },
                {
                  key: 'actions',
                  header: 'Dossier',
                  width: pixel(130),
                  align: 'end',
                  renderCell: ({ character }) => (
                    <Button size="sm" label="Open dossier" onClick={() => { selectPerson(character.id); openDossier(character.id); }} />
                  )
                }
              ]}
            />
          )
        ) : (
          <Empty
            title={data.characters.length ? 'No matching characters' : 'No characters in this view'}
            description={data.characters.length ? 'Try a different search term or broaden the episode scope.' : 'Add characters or scan your scripts to populate the cast register.'}
          />
        )}
      </Pane>}

      {view === 'Scene matrix' && <Pane
        title="Scene and interaction matrix"
        description={`${matrixRows.length} scene${matrixRows.length === 1 ? '' : 's'} with recorded appearances or interactions`}
        padding={5}
      >
        {matrixRows.length > 0 ? (
          <Table<MatrixTableRow>
            density="balanced"
            hasHover
            idKey="id"
            data={matrixRows.map(row => ({ id: `${row.source.documentId}:${row.source.revisionId}:${row.source.sceneId}`, row }))}
            columns={[
              {
                key: 'source',
                header: 'Scene source',
                width: proportional(2, { minWidth: 185 }),
                renderCell: ({ row }) => {
                  const heading = sceneHeadingFor(row);
                  return <VStack gap={0.5} hAlign="start">
                    <SourceButton project={project} source={row.source} onOpen={onOpenSource} />
                    {heading && <Text type="supporting" color="secondary" size="xsm">{heading}</Text>}
                  </VStack>;
                }
              },
              {
                key: 'appearances',
                header: 'Appearances',
                width: proportional(2, { minWidth: 180 }),
                renderCell: ({ row }) => {
                  const people = row.appearances
                    .map(id => data.characters.find(item => item.id === id))
                    .filter((item): item is Character => Boolean(item));
                  if (!people.length) return <Text color="secondary">—</Text>;
                  return <HStack gap={1.5} align="center" wrap="wrap">
                    {people.map(item => (
                      <HStack key={item.id} gap={1} align="center">
                        <CharacterAvatar project={project} character={item} size={24} decorative />
                        <Link onClick={() => { selectPerson(item.id); openDossier(item.id); }}>
                          <Text size="sm">{item.name}</Text>
                        </Link>
                      </HStack>
                    ))}
                  </HStack>;
                }
              },
              {
                key: 'copresence',
                header: 'Co-presence',
                width: pixel(135),
                renderCell: ({ row }) => row.appearances.length > 1
                  ? <Token size="sm" color="blue" label={`${row.appearances.length} together`} />
                  : <Text color="secondary">—</Text>
              },
              {
                key: 'interactions',
                header: 'Recorded interactions',
                width: proportional(3, { minWidth: 220 }),
                renderCell: ({ row }) => row.interactions.length > 0 ? (
                  <VStack gap={1.5} hAlign="start">
                    {row.interactions.map(point => (
                      <VStack key={point.id} gap={0.5} hAlign="start">
                        <Text weight="medium" size="sm">{point.title}</Text>
                        <SourceButton project={project} source={point.source} onOpen={onOpenSource} />
                      </VStack>
                    ))}
                  </VStack>
                ) : <Text color="secondary">—</Text>
              }
            ]}
          />
        ) : (
          <Empty
            title="No scene records in this view"
            description="Record appearances or interactions — or run Scan scripts in Working draft — to populate the scene matrix."
          />
        )}
      </Pane>}

      {view === 'Arcs and continuity' && <VStack gap={5}>
        <ArcTimeline
          project={project}
          data={data}
          episodes={revealedEpisodes}
          onOpen={onOpenSource}
          onEdit={setEditPoint}
          onDossier={id => { selectPerson(id); openDossier(id); }}
          states={canonLookup}
        />

        <Split
          ratio={[5, 6]}
          breakpoint={1020}
          main={
            <Pane title="Cause and effect" level={2} padding={5}>
              {eventRows.some(point => point.causeId) ? (
                <VStack as="ul" gap={0} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {eventRows.filter(point => point.causeId).map((point, idx) => {
                    const cause = data.points.find(event => event.id === point.causeId);
                    if (!cause) return null;
                    return <VStack as="li" key={point.id} gap={0} style={{ listStyle: 'none' }}>
                      {idx > 0 && <Divider />}
                      <Item
                        label={<HStack gap={2} align="center" wrap="wrap">
                          <Text color="secondary">{cause.title}</Text>
                          <Glyph icon={ArrowRight} size="xsm" color="accent" />
                          <Text weight="semibold">{point.title}</Text>
                        </HStack>}
                        endContent={<SourceButton project={project} source={point.source} onOpen={onOpenSource} />}
                      />
                    </VStack>;
                  })}
                </VStack>
              ) : (
                <Text type="supporting" color="secondary">No cause-and-effect links in this view.</Text>
              )}
            </Pane>
          }
          side={
            <Pane title="Continuity review" level={2} padding={5}>
              <VStack gap={4}>
                <VStack gap={2}>
                  <Heading level={3}>Conflicts in recorded canon</Heading>
                  {conflicts.length > 0 ? conflicts.map(problem => {
                    const exception = data.exceptions.find(item => item.id === problem.id);
                    return <Card role="article" key={problem.id} variant={exception ? 'muted' : 'orange'} padding={4}>
                      <VStack gap={2}>
                        <HStack gap={2} align="center" justify="between" wrap="wrap">
                          <HStack gap={2} align="center">
                            <Glyph icon={AlertTriangle} color={exception ? 'secondary' : 'warning'} />
                            <Heading level={4}>{problem.title}</Heading>
                          </HStack>
                          {exception && <Badge variant="success" label="Reviewed exception" />}
                        </HStack>
                        <VStack gap={1.5}>
                          {problem.records.map(point => (
                            <HStack key={point.id} gap={2} align="center" justify="between" wrap="wrap">
                              <Text type="supporting">{sourceText(project, point.source) || point.title}</Text>
                              <SourceButton project={project} source={point.source} onOpen={onOpenSource} />
                            </HStack>
                          ))}
                        </VStack>
                        {exception && (
                          <Text type="supporting" color="secondary">
                            <Text as="span" weight="semibold" type="supporting">Reviewed exception</Text> · {exception.reason}
                          </Text>
                        )}
                        {editable && (
                          <ConflictReviewForm
                            defaultValue={exception?.reason}
                            onSave={reason => change(p => reviewException(p, problem.id, reason, problem.records.map(point => point.id)), 'Continuity exception reviewed.')}
                          />
                        )}
                      </VStack>
                    </Card>;
                  }) : (
                    <Text type="supporting" color="secondary">No continuity conflicts in this view.</Text>
                  )}
                </VStack>

                <Divider />

                <VStack gap={2}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Heading level={3}>Suggested checks</Heading>
                    <Token size="sm" color="gray" label="Generated · not canon" />
                  </HStack>
                  <Text type="supporting" color="secondary">
                    Prompts computed from the records in this view. They never change a record or approved canon.
                  </Text>
                  {checks.length > 0 ? <VStack as="ul" gap={2} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {checks.map(check => {
                      const borderTone = check.kind === 'open-thread' ? 'var(--color-warning)'
                        : check.kind === 'unseen-turn' || check.kind === 'early-appearance' ? 'var(--color-error)'
                        : check.kind === 'source-changed' ? 'var(--color-accent)'
                        : 'var(--color-border-emphasized)';
                      return <VStack as="li" key={check.id} gap={0} style={{ listStyle: 'none' }}>
                        <Card
                          variant="muted"
                          padding={3}
                          style={{ borderLeft: `3px solid ${borderTone}`, borderStyle: 'dashed', borderLeftStyle: 'solid' }}
                        >
                          <VStack gap={1.5} hAlign="start">
                            <Text weight="semibold" size="sm">{check.title}</Text>
                            <Text type="supporting" color="secondary">{check.detail}</Text>
                            {check.records.length > 0 && <HStack gap={2} wrap="wrap">
                              {check.records.map(point => <SourceButton key={point.id} project={project} source={point.source} onOpen={onOpenSource} />)}
                            </HStack>}
                          </VStack>
                        </Card>
                      </VStack>;
                    })}
                  </VStack> : (
                    <Text type="supporting" color="secondary">No suggested checks in this view.</Text>
                  )}
                </VStack>
              </VStack>
            </Pane>
          }
        />
      </VStack>}
    </>}
  </VStack>;
}
