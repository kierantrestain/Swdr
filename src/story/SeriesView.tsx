import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Kbd } from '@astryxdesign/core/Kbd';
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
  AlertTriangle, ArrowLeftRight, ArrowRight, CalendarClock, CheckCircle2, Clapperboard, Download, GitBranch, LayoutGrid,
  Network, Plus, Sparkles, Theater, Trash2, Users
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
import { downloadText, fields, fileStem, sourceDocument, sourceText } from './source';
import {
  allPairConnections, canonStates, characterConnections, characterSummaryStats, flashbacks, pairKey,
  scanProjectScripts, scriptDiscoveryPreview, stageDoublingAnalysis, storyChecks
} from './series-analysis';
import {
  approveCanon, CHARACTER_STATUSES, continuityConflicts, deleteCharacter, deleteStoryPoint, getStory, KNOWLEDGE,
  queryStory, RELATIONSHIP_BONDS, RELATIONSHIPS, relationshipStates, revealTime, reviewException, saveCharacter,
  saveStoryPoint, sceneMatrix, sortStory, STORY_KINDS
} from './series-model';
import type {
  Character, CharacterStatus, KnowledgeState, RelationshipDirection, RelationshipState, SceneMatrixRow, StoryKind,
  StoryPoint, StoryState
} from './series-model';
import { storyBillings, storyStructure } from './story-profile';
import type { StoryStructure } from './story-profile';
import { Choice, Empty, FormError, Glyph, initialSource, Pane, SourceButton, SourceFields, Split, StoryDialog } from './StoryControls';
import { CanonBadge, CharacterAvatar, EpisodeChip, PointRows, relationshipStyle, typeLabels } from './StoryParts';
import type { CanonLookup, PointPrefill } from './StoryParts';

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

function CharacterFormDialog({ project, document, character, save, onDelete, onPhotoUpdate, close }: EditorProps & {
  character?: Character;
  save: (character: Character) => boolean;
  onDelete?: (characterId: string) => void;
  onPhotoUpdate: (added: Asset[], removedIds: ReadonlyArray<string | undefined>) => void;
}) {
  const billings = storyBillings(project.kind);
  const [name, setName] = useState(character?.name ?? '');
  const [role, setRole] = useState(character?.role ?? '');
  const [billing, setBilling] = useState(character?.billing ?? billings[0]);
  const [status, setStatus] = useState<CharacterStatus>(character?.status ?? 'Active');
  const [bio, setBio] = useState(character?.bio ?? '');
  const [motivation, setMotivation] = useState(character?.motivation ?? '');
  const [conflict, setConflict] = useState(character?.conflict ?? '');
  const [notes, setNotes] = useState(character?.notes ?? '');
  const [aliases, setAliases] = useState(character?.aliases.join('\n') ?? '');
  const [photoAssetId, setPhotoAssetId] = useState(character?.photoAssetId);
  const [assetIds, setAssetIds] = useState<string[]>(character?.assetIds ?? []);
  const [source, setSource] = useState(character?.source ?? initialSource(project, document));
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  function saveCharacterForm() {
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
    onSubmit={saveCharacterForm}
    footer={<HStack gap={2} justify="between" align="center" wrap="wrap" style={{ width: '100%' }}>
      {character && onDelete ? (
        confirmDelete ? (
          <HStack gap={2} align="center">
            <Text type="supporting" size="xsm" style={{ color: 'var(--color-text-error)' }}>Remove from working draft?</Text>
            <Button size="sm" variant="destructive" label="Confirm delete" onClick={() => { onDelete(character.id); close(); }} />
            <Button size="sm" variant="ghost" label="Keep" onClick={() => setConfirmDelete(false)} />
          </HStack>
        ) : (
          <Button size="sm" variant="ghost" icon={<Glyph icon={Trash2} size="xsm" />} label="Delete character" onClick={() => setConfirmDelete(true)} />
        )
      ) : <HStack />}
      <HStack gap={2} justify="end">
        <Button label="Cancel" onClick={close} />
        <Button type="submit" variant="primary" label="Save character" isDisabled={!source || !name.trim()} />
      </HStack>
    </HStack>}
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

      <VStack gap={3} style={{ flex: '1 1 22rem', minWidth: 0 }}>
        <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
          <TextInput label="Name" value={name} onChange={setName} isRequired />
          <TextInput label="Role" value={role} onChange={setRole} placeholder="Protagonist, Investigator, Mentor" />
          <Choice
            label="Billing"
            value={billing}
            onChange={setBilling}
            options={billings.map(value => ({ value, label: value }))}
          />
          <Choice
            label="Status"
            value={status}
            onChange={value => setStatus(value as CharacterStatus)}
            options={CHARACTER_STATUSES.map(value => ({ value, label: value }))}
          />
        </Grid>
        <TextArea label="Character overview" value={bio} onChange={setBio} rows={2} placeholder="One-sentence summary of who they are when the story begins." />
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
      </VStack>
    </HStack>
  </StoryDialog>;
}

function PointFormDialog({ project, document, data, point, prefill, save, onDelete, close }: EditorProps & {
  data: StoryState;
  point?: StoryPoint;
  prefill?: PointPrefill;
  save: (point: StoryPoint) => boolean;
  onDelete?: (pointId: string) => void;
}) {
  const initialKind: StoryKind = point?.kind ?? prefill?.kind ?? 'event';
  const initialParticipants = point?.participants ?? prefill?.participants ?? [];
  const [kind, setKind] = useState<StoryKind>(initialKind);
  const [storyOrder, setStoryOrder] = useState<number>(point?.storyOrder ?? 10);
  const [title, setTitle] = useState(point?.title ?? prefill?.title ?? '');
  const [detail, setDetail] = useState(point?.detail ?? '');
  const [source, setSource] = useState(point?.source ?? prefill?.source ?? initialSource(project, document));
  const [people, setPeople] = useState<string[]>(initialParticipants);
  const [fromCharId, setFromCharId] = useState<string>(initialParticipants[0] ?? '');
  const [toCharId, setToCharId] = useState<string>(initialParticipants[1] ?? '');
  const [relationship, setRelationship] = useState<RelationshipState>(point?.relationship ?? prefill?.relationship ?? 'Trust');
  const [direction, setDirection] = useState<RelationshipDirection>(point?.direction ?? prefill?.direction ?? 'mutual');
  const [bond, setBond] = useState<string>(point?.bond ?? prefill?.bond ?? '');
  const [factKey, setFactKey] = useState(point?.factKey ?? '');
  const [knowledge, setKnowledge] = useState<KnowledgeState>(point?.knowledge ?? 'Confirmed');
  const [causeId, setCauseId] = useState(point?.causeId ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const reveal = source ? revealTime(project, source) : -1;
  const characterOptions = data.characters.filter(person => reveal < 0 || revealTime(project, person.source) <= reveal);
  const events = data.points.filter(event => event.kind === 'event' && event.id !== point?.id);
  const isPairKind = kind === 'relationship' || kind === 'interaction';
  const minPeople = kind === 'event' ? 0 : isPairKind ? 2 : 1;

  function savePointForm() {
    if (!source || !title.trim()) {
      setError('Enter a title and choose an exact source line.');
      return;
    }
    const chosenParticipants = isPairKind
      ? [fromCharId, toCharId].filter(id => Boolean(id) && characterOptions.some(person => person.id === id))
      : people.filter(id => characterOptions.some(person => person.id === id));

    if (isPairKind && (chosenParticipants.length !== 2 || chosenParticipants[0] === chosenParticipants[1])) {
      setError('Choose two distinct characters already introduced at this script point.');
      return;
    }

    const ok = save({
      id: point?.id ?? newId(),
      kind,
      title: title.trim(),
      detail: detail.trim(),
      source,
      storyOrder: Number.isFinite(storyOrder) ? storyOrder : 1,
      participants: chosenParticipants,
      relationship: kind === 'relationship' ? relationship : undefined,
      direction: kind === 'relationship' ? direction : undefined,
      bond: kind === 'relationship' ? (bond.trim() || undefined) : undefined,
      knowledge: kind === 'knowledge' ? knowledge : undefined,
      factKey: kind === 'knowledge' ? factKey.trim() : undefined,
      causeId: kind === 'event' || kind === 'arc' ? causeId || undefined : undefined
    });
    if (ok) close();
  }

  return <StoryDialog
    title={point ? 'Edit story record' : kind === 'relationship' ? 'Set relationship' : kind === 'interaction' ? 'Log interaction' : 'Add story record'}
    subtitle="The script line controls when the audience learns it; story order controls chronology."
    width={680}
    onClose={close}
    onSubmit={savePointForm}
    footer={<HStack gap={2} justify="between" align="center" wrap="wrap" style={{ width: '100%' }}>
      {point && onDelete ? (
        confirmDelete ? (
          <HStack gap={2} align="center">
            <Text type="supporting" size="xsm" style={{ color: 'var(--color-text-error)' }}>Delete from working draft?</Text>
            <Button size="sm" variant="destructive" label="Confirm delete" onClick={() => { onDelete(point.id); close(); }} />
            <Button size="sm" variant="ghost" label="Keep" onClick={() => setConfirmDelete(false)} />
          </HStack>
        ) : (
          <Button size="sm" variant="ghost" icon={<Glyph icon={Trash2} size="xsm" />} label="Delete record" onClick={() => setConfirmDelete(true)} />
        )
      ) : <HStack />}
      <HStack gap={2} justify="end">
        <Button label="Cancel" onClick={close} />
        <Button type="submit" variant="primary" label="Save record" isDisabled={!source || !title.trim()} />
      </HStack>
    </HStack>}
  >
    <VStack gap={3}>
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <Choice
          label="Record type"
          value={kind}
          onChange={value => {
            const nextKind = value as StoryKind;
            setKind(nextKind);
            if ((nextKind === 'relationship' || nextKind === 'interaction') && !fromCharId && people.length) {
              setFromCharId(people[0] ?? '');
              setToCharId(people[1] ?? '');
            }
          }}
          options={STORY_KINDS.map(item => ({ value: item, label: typeLabels[item] }))}
        />
        <NumberInput
          label="Story time order"
          description="Use a lower number for a flashback."
          value={storyOrder}
          onChange={value => setStoryOrder(Number(value) || 0)}
        />
      </Grid>

      {isPairKind && characterOptions.length > 0 && <VStack gap={3}>
        <HStack gap={2} align="end" wrap="wrap">
          <VStack style={{ flex: '1 1 11rem' }}>
            <Choice
              label={kind === 'relationship' && direction === 'directed' ? 'From character' : 'Character A'}
              value={fromCharId}
              onChange={setFromCharId}
              options={[{ value: '', label: 'Choose character…' }, ...characterOptions.map(person => ({ value: person.id, label: person.name }))]}
            />
          </VStack>
          <Button
            size="sm"
            variant="ghost"
            icon={<Glyph icon={ArrowLeftRight} size="xsm" />}
            label="Swap"
            onClick={() => {
              setFromCharId(toCharId);
              setToCharId(fromCharId);
            }}
          />
          <VStack style={{ flex: '1 1 11rem' }}>
            <Choice
              label={kind === 'relationship' && direction === 'directed' ? 'Toward character' : 'Character B'}
              value={toCharId}
              onChange={setToCharId}
              options={[{ value: '', label: 'Choose character…' }, ...characterOptions.map(person => ({ value: person.id, label: person.name }))]}
            />
          </VStack>
        </HStack>

        {kind === 'relationship' && <>
          <VStack gap={1}>
            <Text type="label" color="secondary">Direction</Text>
            <SegmentedControl
              label="Relationship direction"
              size="sm"
              value={direction}
              onChange={value => setDirection(value as RelationshipDirection)}
            >
              <SegmentedControlItem value="mutual" label="Mutual (both ways ↔)" />
              <SegmentedControlItem value="directed" label="One-way / asymmetric (→)" />
            </SegmentedControl>
          </VStack>
          <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
            <Choice
              label="Relationship state"
              value={relationship}
              onChange={value => setRelationship(value as RelationshipState)}
              options={RELATIONSHIPS.map(state => ({ value: state, label: state }))}
            />
            <Choice
              label="Relationship type (bond)"
              value={bond}
              onChange={setBond}
              options={[{ value: '', label: 'Select bond type (optional)' }, ...RELATIONSHIP_BONDS.map(item => ({ value: item, label: item }))]}
            />
          </Grid>
        </>}
      </VStack>}

      <TextInput label={kind === 'knowledge' ? 'Fact or open question' : 'Title'} value={title} onChange={setTitle} placeholder={kind === 'relationship' ? 'e.g. Nora trusts Elias with the timetable' : undefined} isRequired />
      <TextArea label="Detail" value={detail} onChange={setDetail} rows={2} />
      <SourceFields project={project} value={source} onChange={setSource} />

      {!isPairKind && characterOptions.length > 0 && <CheckboxList
        label={`Characters${minPeople ? ` · Select ${minPeople}` : ''}`}
        density="compact"
        value={people}
        onChange={setPeople}
      >
        {characterOptions.map(person => (
          <CheckboxListItem key={person.id} value={person.id} label={person.name} description={person.role || undefined} />
        ))}
      </CheckboxList>}

      {kind === 'knowledge' && <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3}>
        <TextInput label="Shared fact key" value={factKey} onChange={setFactKey} placeholder="e.g. missing-evidence" isRequired />
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
    </VStack>
  </StoryDialog>;
}

function ScriptScanDialog({ project, structure, draft, onImport, close }: {
  project: Project;
  structure: StoryStructure;
  draft: StoryState;
  onImport: (characters: Character[], points: StoryPoint[]) => void;
  close: () => void;
}) {
  const scan = useMemo(() => scanProjectScripts(project, draft, structure.document?.id), [draft, project, structure.document?.id]);
  const coreCastCues = useMemo(() => {
    if (scan.newCharacters.length <= 16) return scan.newCharacters.map(item => item.cueName);
    const recurring = scan.newCharacters.filter(item => item.speeches >= 2).slice(0, 18);
    return (recurring.length ? recurring : scan.newCharacters.slice(0, 14)).map(item => item.cueName);
  }, [scan.newCharacters]);
  const [chosenChars, setChosenChars] = useState<string[]>(() => coreCastCues);
  const [charFilter, setCharFilter] = useState('');
  const [chosenApps, setChosenApps] = useState<string[]>(() => scan.newAppearances.slice(0, 16).map((_, i) => String(i)));
  const [chosenLinks, setChosenLinks] = useState<string[]>(() =>
    draft.characters.length === 0 ? scan.suggestedLinks.slice(0, 8).map(item => item.key) : []
  );
  const [mapNewCharScenes, setMapNewCharScenes] = useState(true);

  const visibleNewChars = useMemo(() => {
    const needle = charFilter.trim().toLocaleLowerCase('en-GB');
    if (!needle) return scan.newCharacters;
    return scan.newCharacters.filter(item =>
      item.name.toLocaleLowerCase('en-GB').includes(needle)
      || item.suggestedBilling.toLocaleLowerCase('en-GB').includes(needle)
      || item.firstEpisodeLabel.toLocaleLowerCase('en-GB').includes(needle)
    );
  }, [charFilter, scan.newCharacters]);

  function apply() {
    if (chosenChars.length + chosenApps.length + chosenLinks.length === 0) return;
    const newCharacters: Character[] = scan.newCharacters
      .filter(item => chosenChars.includes(item.cueName))
      .map(item => ({
        id: newId(),
        name: item.name,
        role: '',
        billing: item.suggestedBilling,
        status: 'Active',
        motivation: '',
        conflict: '',
        aliases: item.cueName.toLowerCase() !== item.name.toLowerCase() ? [item.cueName] : [],
        source: item.source
      }));

    // Lookup key -> Character ID across both existing and newly created characters
    const idByKey = new Map<string, string>();
    for (const person of [...draft.characters, ...newCharacters]) {
      idByKey.set(person.name.trim().toLocaleLowerCase('en-GB'), person.id);
      for (const alias of person.aliases) idByKey.set(alias.trim().toLocaleLowerCase('en-GB'), person.id);
      const first = person.name.split(/\s+/)[0]?.trim().toLocaleLowerCase('en-GB');
      if (first && !idByKey.has(first)) idByKey.set(first, person.id);
    }

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

    // Also map scene appearances for newly imported characters in the same pass so Story Map & Scene Matrix populate immediately.
    if (mapNewCharScenes && newCharacters.length > 0) {
      const followUp = scanProjectScripts(project, { ...draft, characters: [...draft.characters, ...newCharacters] }, structure.document?.id);
      const newIds = new Set(newCharacters.map(item => item.id));
      for (const app of followUp.newAppearances.filter(item => newIds.has(item.characterId)).slice(0, 260)) {
        newPoints.push({
          id: newId(),
          kind: 'appearance',
          title: app.title,
          detail: `${app.characterName} speaks in ${app.sceneHeading}.`,
          participants: [app.characterId],
          source: app.source,
          storyOrder: app.storyOrder
        });
      }
    }

    // Seed optional shared-scene relationship links (anchored to their first shared scene) so the Relationship Web lights up immediately.
    for (const link of scan.suggestedLinks.filter(item => chosenLinks.includes(item.key))) {
      const aId = idByKey.get(link.aKey);
      const bId = idByKey.get(link.bKey);
      if (!aId || !bId || aId === bId) continue;
      newPoints.push({
        id: newId(),
        kind: 'relationship',
        title: link.title,
        detail: `Seeded from ${link.sharedScenes} shared scene${link.sharedScenes === 1 ? '' : 's'} in the script. Refine the relationship state as you develop the draft.`,
        participants: [aId, bId],
        relationship: 'Trust',
        source: link.source,
        storyOrder: link.storyOrder
      });
    }

    onImport(newCharacters, newPoints);
    close();
  }

  const totalSelected = chosenChars.length + chosenApps.length + chosenLinks.length;
  const isEmpty = !scan.newCharacters.length && !scan.newAppearances.length && !scan.suggestedLinks.length;

  return <StoryDialog
    title="Scan scripts for characters & appearances"
    subtitle={`Reads speaking cues across your ${structure.mode === 'episodic' ? 'episode scripts' : 'script scenes'} and anchors every imported record to its exact line in your working draft.`}
    width={720}
    onClose={close}
    onSubmit={!isEmpty && totalSelected > 0 ? apply : undefined}
    footer={isEmpty ? (
      <HStack gap={2} justify="end">
        <Button label="Close" onClick={close} />
      </HStack>
    ) : (
      <HStack gap={3} justify="between" align="center" wrap="wrap" style={{ width: '100%' }}>
        <HStack gap={1.5} align="center">
          <Text type="supporting" color="secondary" size="xsm">Press</Text>
          <Kbd keys="enter" />
          <Text type="supporting" color="secondary" size="xsm">
            to import ({chosenChars.length} cast{chosenLinks.length ? ` · ${chosenLinks.length} links` : ''})
          </Text>
        </HStack>
        <HStack gap={2} align="center">
          <Button label="Cancel" onClick={close} />
          <Button
            type="submit"
            variant="primary"
            icon={<Glyph icon={Sparkles} />}
            label={`Import ${totalSelected} selection${totalSelected === 1 ? '' : 's'} to draft`}
            isDisabled={totalSelected === 0}
          />
        </HStack>
      </HStack>
    )}
  >
    {isEmpty ? (
      <Empty
        title="Scripts are already in sync"
        description={`Every speaking character and scene appearance found in your script is already recorded in ${structure.terms.workspaceTitle}.`}
      />
    ) : <VStack gap={4}>
      {scan.newCharacters.length > 0 && <VStack gap={2}>
        <HStack gap={2} justify="between" align="center" wrap="wrap">
          {scan.newCharacters.length > 8 ? (
            <TextInput
              label="Filter speaking characters"
              isLabelHidden
              size="sm"
              type="search"
              placeholder={`Filter ${scan.newCharacters.length} speaking characters…`}
              value={charFilter}
              onChange={setCharFilter}
              width={260}
            />
          ) : (
            <Text type="supporting" color="secondary" size="xsm">
              {chosenChars.length} of {scan.newCharacters.length} selected
            </Text>
          )}
          <HStack gap={1} align="center" wrap="wrap">
            {scan.newCharacters.length > coreCastCues.length && (
              <Button size="sm" variant="ghost" label={`Core cast (${coreCastCues.length})`} onClick={() => setChosenChars(coreCastCues)} />
            )}
            <Button size="sm" variant="ghost" label="Select all" onClick={() => setChosenChars(scan.newCharacters.map(item => item.cueName))} />
            <Button size="sm" variant="ghost" label="Clear" onClick={() => setChosenChars([])} />
          </HStack>
        </HStack>
        <CheckboxList
          label={`Unrecorded speaking characters (${scan.newCharacters.length})`}
          density="compact"
          value={chosenChars}
          onChange={setChosenChars}
        >
          {visibleNewChars.map(item => (
            <CheckboxListItem
              key={item.cueName}
              value={item.cueName}
              label={`${item.name} · ${item.suggestedBilling}`}
              description={`First speaks in ${item.firstEpisodeLabel} · ${item.speeches} speech${item.speeches === 1 ? '' : 'es'} across ${item.scenes} scene${item.scenes === 1 ? '' : 's'}`}
            />
          ))}
        </CheckboxList>
        {visibleNewChars.length === 0 && (
          <Text type="supporting" color="secondary" size="sm">No speaking characters match “{charFilter}”.</Text>
        )}
        <CheckboxInput
          label="Also record scene appearances for imported characters"
          description="Populates the Story map, Scene matrix and character presence heatmaps automatically."
          value={mapNewCharScenes}
          onChange={setMapNewCharScenes}
        />
      </VStack>}

      {scan.suggestedLinks.length > 0 && <CheckboxList
        label={`Shared-scene character links (${scan.suggestedLinks.length} recurring pairs)`}
        density="compact"
        value={chosenLinks}
        onChange={setChosenLinks}
      >
        {scan.suggestedLinks.map(item => (
          <CheckboxListItem
            key={item.key}
            value={item.key}
            label={`${item.aName} & ${item.bName}`}
            description={`${item.title} · first linked in ${item.firstSceneLabel}`}
          />
        ))}
      </CheckboxList>}

      {scan.newAppearances.length > 0 && <CheckboxList
        label={`Unrecorded scene appearances (${scan.newAppearances.length})`}
        density="compact"
        value={chosenApps}
        onChange={setChosenApps}
      >
        {scan.newAppearances.slice(0, 30).map((item, idx) => (
          <CheckboxListItem
            key={`${item.characterId}-${idx}`}
            value={String(idx)}
            label={`${item.episodeLabel} · ${item.characterName}`}
            description={item.sceneHeading}
          />
        ))}
      </CheckboxList>}
    </VStack>}
  </StoryDialog>;
}

/** Dual-axis reveal-order vs. story-time chronology ribbon with explicit fill="none" paths so flashbacks read cleanly. */
function Chronology({ project, structure, events, flags, activeId, onSelect }: {
  project: Project;
  structure: StoryStructure;
  events: StoryPoint[];
  flags: Map<string, string>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (events.length < 2) return null;
  const reveal = sortStory(project, events, 'reveal');
  const story = sortStory(project, events, 'story');
  const epLabel = (point: StoryPoint) => structure.unitCodeOfSource(point.source);
  const x = (index: number) => 36 + index * (928 / (events.length - 1));
  const storyIndex = new Map(story.map((point, index) => [point.id, index]));

  return <Card variant="muted" padding={4}>
    <VStack gap={2}>
      <HStack justify="between" align="center" wrap="wrap">
        <Text type="label" color="secondary">
          Reveal order · {structure.mode === 'episodic' ? 'episode and line' : 'script scene and line'}
        </Text>
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

interface StageLoadRow extends Record<string, unknown> {
  id: string;
  character: Character;
  totalScenes: number;
  byAct: Array<{ actNumber: number; actLabel: string; scenes: number }>;
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
  /** The story workspace named in the address, e.g. story-map. */
  tab?: string;
  onTabChange?: (tab: string) => void;
  /** Optional deep-linked character dossier id from the route or command palette. */
  characterId?: string;
  onCharacterChange?: (characterId?: string) => void;
}) {
  const structure = useMemo(() => storyStructure(project, document.id), [project, document.id]);
  const units = structure.units;
  const currentUnit = structure.mode === 'episodic'
    ? units.find(item => item.id === document.episodeId)
    : undefined;
  const [group, setGroup] = useState(currentUnit?.groupNumber ?? 0);
  const [exact, setExact] = useState('');
  const [asOf, setAsOf] = useState(currentUnit?.id ?? '');
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
  const [form, setForm] = useState<
    | { kind: 'character'; item?: Character }
    | { kind: 'point'; item?: StoryPoint; prefill?: PointPrefill }
    | { kind: 'scan' }
  >();
  const [error, setError] = useState('');

  const store = useMemo(() => getStory(project), [project]);
  const canon = version === 'draft' ? undefined : store.canon.find(item => item.id === version) ?? store.canon.at(-1);
  const scope = useMemo(() => ({
    season: group || undefined,
    episodeId: exact || undefined,
    asOfId: asOf || undefined,
    documentId: structure.mode === 'script' ? structure.document?.id : undefined
  }), [group, exact, asOf, structure.mode, structure.document?.id]);
  const data = useMemo(() => queryStory(project, canon?.data ?? store.draft, scope), [project, canon?.data, store.draft, scope]);
  const editable = !readOnly && !canon;
  const person = data.characters.find(item => item.id === focusedPerson) ?? data.characters[0];
  const edges = useMemo(() => relationshipStates(project, data.points), [project, data.points]);
  const eventRows = useMemo(() => sortStory(project, data.points.filter(point => point.kind === 'event'), order), [project, data.points, order]);
  const interactions = useMemo(
    () => sortStory(project, data.points.filter(point => point.kind === 'interaction' && point.participants.includes(person?.id ?? '')), 'reveal').reverse(),
    [project, data.points, person?.id]
  );
  const selectPerson = (id: string) => setFocusedPerson(id);
  const introOf = (item: Character) => structure.unitCodeOfSource(item.source);
  const setEditPoint = editable ? (point: StoryPoint) => setForm({ kind: 'point', item: point }) : undefined;
  const setCreatePoint = editable ? (prefill: PointPrefill) => setForm({ kind: 'point', prefill }) : undefined;
  const displayDossier = dossier && Boolean(person);
  const canonLookup: CanonLookup = useMemo(() => canon ? undefined : canonStates(store), [canon, store]);
  const cutoffIndex = asOf ? units.findIndex(item => item.id === asOf) : units.length - 1;
  const scopeUnits = useMemo(
    () => units.filter(item => (!group || item.groupNumber === group) && (!exact || item.id === exact)),
    [units, group, exact]
  );
  const revealedUnits = useMemo(
    () => scopeUnits.filter(item => units.indexOf(item) <= cutoffIndex),
    [scopeUnits, units, cutoffIndex]
  );
  const flashbackFlags = useMemo(
    () => new Map([...flashbacks(project, data.points)].map(id => [id, 'Revealed out of order'] as const)),
    [project, data.points]
  );
  const conflicts = useMemo(() => continuityConflicts(data.points), [data.points]);
  const checks = useMemo(
    () => storyChecks(project, data, revealedUnits, structure.document?.id),
    [project, data, revealedUnits, structure.document?.id]
  );
  const draftCount = useMemo(
    () => canonLookup ? [...canonLookup.values()].filter(state => state !== 'approved').length : 0,
    [canonLookup]
  );
  const statsByChar = useMemo(() => new Map(
    data.characters.map(item => [item.id, characterSummaryStats(project, data, item.id, structure.document?.id)] as const)
  ), [project, data, structure.document?.id]);
  const connectionsCountByChar = useMemo(() => new Map(
    data.characters.map(item => [item.id, characterConnections(project, data, item.id, structure.document?.id).length] as const)
  ), [project, data, structure.document?.id]);
  const pairSummaryMap = useMemo(
    () => new Map(allPairConnections(project, data, structure.document?.id).map(item => [item.pairKey, item] as const)),
    [project, data, structure.document?.id]
  );
  const stageReport = useMemo(
    () => project.kind === 'stage' ? stageDoublingAnalysis(project, data, structure.document?.id) : undefined,
    [data, project, structure.document?.id]
  );
  const discovery = useMemo(
    () => (store.draft.characters.length === 0 ? scriptDiscoveryPreview(project, structure.document?.id) : undefined),
    [project, store.draft.characters.length, structure.document?.id]
  );

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

  const groupOptions = [
    { value: '0', label: structure.terms.allGroupsLabel },
    ...structure.groups.map(item => ({ value: String(item.number), label: item.label }))
  ];
  const asOfOptions = [
    { value: '', label: structure.terms.asOfAllLabel },
    ...units
      .filter(item => !group || item.groupNumber === group)
      .map(item => ({ value: item.id, label: `As of ${item.code}` }))
  ];
  const exactFilterOptions = [
    { value: '', label: structure.terms.exactAllLabel },
    ...units
      .filter((item, index) => (!group || item.groupNumber === group) && (!asOf || index <= units.findIndex(u => u.id === asOf)))
      .map(item => ({ value: item.id, label: `${item.code} · ${item.title}` }))
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

  const activeGroupLabel = group
    ? structure.groups.find(item => item.number === group)?.label ?? `${structure.terms.groupLabel} ${group}`
    : structure.mode === 'episodic'
      ? structure.terms.allGroupsLabel
      : structure.terms.structureBadge;

  return <VStack gap={5} id="main-content" className="swdr-page" aria-label={`${structure.terms.workspaceTitle} workspace`}>
    <PageHeader
      eyebrow={`${project.title} — ${activeGroupLabel}`}
      title={displayDossier && person ? person.name : structure.terms.workspaceTitle}
      subtitle={displayDossier && person
        ? [person.role, 'Character dossier'].filter(Boolean).join(' · ')
        : `${canon ? 'Approved canon' : 'Working draft'} · ${project.title}`}
      actions={<HStack gap={2} align="center" wrap="wrap">
        {structure.groups.length > 0 && (
          <Choice
            label={structure.terms.groupLabel}
            isLabelHidden
            size="sm"
            width={145}
            value={String(group)}
            onChange={value => { setGroup(Number(value)); setExact(''); setAsOf(''); }}
            options={groupOptions}
          />
        )}
        {units.length > 0 && (
          <Choice
            label={structure.terms.asOfLabel}
            isLabelHidden
            size="sm"
            width={184}
            value={asOf}
            onChange={value => { setAsOf(value); setExact(''); }}
            options={asOfOptions}
          />
        )}
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

    {editable && discovery && discovery.speakingRoles > 0 && (
      <Banner
        status="info"
        title={`Found ${discovery.speakingRoles} speaking character${discovery.speakingRoles === 1 ? '' : 's'} across ${discovery.scenes} scene${discovery.scenes === 1 ? '' : 's'} in ${project.title}`}
        description={`${discovery.groups} ${discovery.groups === 1 ? discovery.groupLabel : `${discovery.groupLabel}s`} detected${discovery.sharedPairs ? ` · ${discovery.sharedPairs} shared-scene pair${discovery.sharedPairs === 1 ? '' : 's'}` : ''}${discovery.topNames.length ? ` (${discovery.topNames.join(', ')})` : ''}. Scan the script to populate your Relationship web, Story map, Character dossiers and Scene matrix in one step.`}
        endContent={
          <Button
            variant="primary"
            size="sm"
            label="Scan script & build draft"
            icon={<Glyph icon={Sparkles} size="xsm" />}
            onClick={() => setForm({ kind: 'scan' })}
          />
        }
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
          {units.length > 0 && (
            <Choice
              label={structure.terms.exactFilterLabel}
              isLabelHidden
              size="sm"
              width={215}
              value={exact}
              onChange={setExact}
              options={exactFilterOptions}
            />
          )}
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
        onDelete={id => {
          if (change(p => deleteCharacter(p, id), 'Character removed from working draft.')) {
            if (focusedPerson === id) {
              setFocusedPerson('');
              setDossier(false);
            }
          }
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
        key={form.item?.id ?? `new-${form.prefill?.kind ?? 'record'}-${form.prefill?.participants?.join('-') ?? ''}`}
        project={project}
        document={document}
        data={store.draft}
        point={form.item}
        prefill={form.prefill}
        close={() => setForm(undefined)}
        onDelete={id => { change(p => deleteStoryPoint(p, id), 'Story record deleted from working draft.'); }}
        save={point => change(p => saveStoryPoint(p, point), 'Story record saved.')}
      />
    )}

    {form?.kind === 'scan' && (
      <ScriptScanDialog
        project={project}
        structure={structure}
        draft={store.draft}
        close={() => setForm(undefined)}
        onImport={(newChars, newPoints) => {
          change(currentProject => {
            let next = currentProject;
            for (const character of newChars) next = saveCharacter(next, character);
            for (const point of newPoints) {
              try { next = saveStoryPoint(next, point); } catch { /* skip invalid out-of-order point */ }
            }
            return next;
          }, `Imported ${newChars.length + newPoints.length} script records to working draft.`);
        }}
      />
    )}

    {displayDossier && person ? (
      <CharacterDossier
        project={project}
        structure={structure}
        person={person}
        data={data}
        states={edges}
        active={dossierPane}
        units={revealedUnits}
        setActive={setDossierPane}
        onOpen={onOpenSource}
        onEdit={setEditPoint}
        onCreatePoint={setCreatePoint}
        onEditCharacter={editable ? () => setForm({ kind: 'character', item: person }) : undefined}
        onSelectPerson={id => { selectPerson(id); openDossier(id); }}
        canon={canonLookup}
      />
    ) : <>
      {view === 'Relationship web' && <VStack gap={5}>
        <RelationshipWeb
          project={project}
          structure={structure}
          person={person}
          characters={data.characters}
          edges={edges}
          interactions={interactions}
          points={data.points}
          select={selectPerson}
          dossier={() => openDossier()}
          onOpen={onOpenSource}
          onEdit={setEditPoint}
          onCreatePoint={setCreatePoint}
          states={canonLookup}
        />
        <MajorEventsTimeline
          project={project}
          structure={structure}
          events={eventRows}
          characters={data.characters}
          order={order}
          onOrderChange={setOrder}
          flashbackFlags={flashbackFlags}
          states={canonLookup}
          onOpen={onOpenSource}
          onEdit={setEditPoint}
          onOpenLedger={() => setView('Event ledger')}
        />
      </VStack>}

      {view === 'Story map' && (
        <StoryMap
          project={project}
          structure={structure}
          data={data}
          units={scopeUnits}
          cutoff={cutoffIndex}
          onOpen={onOpenSource}
          onEdit={setEditPoint}
          states={canonLookup}
          onDossier={id => { selectPerson(id); openDossier(id); }}
        />
      )}

      {view === 'Event ledger' && <Pane
        title="Event ledger"
        label="Event ledger"
        description={`${order === 'reveal'
          ? `Ordered by the ${structure.mode === 'episodic' ? 'episode' : 'scene'} and line where the audience learns each event.`
          : 'Ordered by when each event happens in the world of the story.'}${flashbackFlags.size > 0 ? ` ${flashbackFlags.size} event${flashbackFlags.size === 1 ? ' is' : 's are'} revealed out of story order.` : ''}`}
        actions={orderToggle}
        padding={5}
      >
        <Chronology
          project={project}
          structure={structure}
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
                const stats = statsByChar.get(item.id);
                const connCount = connectionsCountByChar.get(item.id) ?? 0;
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
                        <Token size="sm" color="blue" label={`Introduced ${introOf(item)}`} />
                        <Text type="supporting" color="secondary" size="xsm">
                          {stats?.records ?? 0} record{(stats?.records ?? 0) === 1 ? '' : 's'} · {connCount} connection{connCount === 1 ? '' : 's'}
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
                  width: pixel(120),
                  renderCell: ({ character }) => <EpisodeChip project={project} episodeId={character.source.episodeId} source={character.source} />
                },
                {
                  key: 'records',
                  header: 'Records',
                  width: pixel(84),
                  align: 'end',
                  renderCell: ({ character }) => <Text weight="semibold">{statsByChar.get(character.id)?.records ?? 0}</Text>
                },
                {
                  key: 'links',
                  header: 'Links',
                  width: pixel(76),
                  align: 'end',
                  renderCell: ({ character }) => connectionsCountByChar.get(character.id) ?? 0
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
            description={data.characters.length ? 'Try a different search term or broaden the scope.' : 'Add characters or scan your script to populate the cast register.'}
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
                header: 'Dynamics',
                width: proportional(2, { minWidth: 165 }),
                renderCell: ({ row }) => {
                  if (row.appearances.length < 2) return <Text color="secondary">—</Text>;
                  const badges: Array<{ key: string; label: string; color: ReturnType<typeof relationshipStyle[RelationshipState]['tokenColor']['toString']> }> = [];
                  for (let i = 0; i < row.appearances.length; i += 1) {
                    for (let j = i + 1; j < row.appearances.length; j += 1) {
                      const summary = pairSummaryMap.get(pairKey([row.appearances[i], row.appearances[j]]));
                      const state = summary?.mutual?.relationship ?? summary?.aToB?.relationship ?? summary?.bToA?.relationship;
                      if (summary && state) {
                        badges.push({
                          key: summary.pairKey,
                          label: `${summary.a.name.split(' ')[0]}–${summary.b.name.split(' ')[0]}: ${state}`,
                          color: relationshipStyle[state].tokenColor
                        });
                      }
                    }
                  }
                  return <VStack gap={1} hAlign="start">
                    <Token size="sm" color="blue" label={`${row.appearances.length} together`} />
                    {badges.slice(0, 2).map(badge => (
                      <Token key={badge.key} size="sm" color={badge.color as 'blue'} label={badge.label} />
                    ))}
                  </VStack>;
                }
              },
              {
                key: 'interactions',
                header: 'Recorded interactions',
                width: proportional(3, { minWidth: 220 }),
                renderCell: ({ row }) => <VStack gap={1.5} hAlign="start">
                  {row.interactions.length > 0 ? row.interactions.map(point => (
                    <VStack key={point.id} gap={0.5} hAlign="start">
                      <Text weight="medium" size="sm">{point.title}</Text>
                      <HStack gap={1.5} align="center">
                        <SourceButton project={project} source={point.source} onOpen={onOpenSource} />
                        {setEditPoint && <Button size="sm" variant="ghost" label="Edit" onClick={() => setEditPoint(point)} />}
                      </HStack>
                    </VStack>
                  )) : <Text color="secondary">—</Text>}
                  {setCreatePoint && row.appearances.length >= 2 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Glyph icon={Plus} size="xsm" />}
                      label="Log interaction"
                      onClick={() => setCreatePoint({
                        kind: 'interaction',
                        participants: row.appearances.slice(0, 2),
                        source: row.source
                      })}
                    />
                  )}
                </VStack>
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
          structure={structure}
          data={data}
          units={revealedUnits}
          onOpen={onOpenSource}
          onEdit={setEditPoint}
          onDossier={id => { selectPerson(id); openDossier(id); }}
          states={canonLookup}
        />

        {stageReport && stageReport.loads.length > 0 && (
          <Pane
            title="Stage presence & repertory doubling"
            label="Stage presence and doubling"
            description="Per-act stage time and non-Principal roles that never share a scene."
            padding={5}
          >
            <Split
              ratio={[6, 5]}
              breakpoint={960}
              main={
                <Table<StageLoadRow>
                  density="compact"
                  hasHover
                  idKey="id"
                  data={stageReport.loads.map(row => ({ id: row.character.id, ...row }))}
                  columns={[
                    {
                      key: 'character',
                      header: 'Role',
                      width: proportional(2, { minWidth: 160 }),
                      renderCell: ({ character }) => (
                        <HStack gap={2} align="center">
                          <CharacterAvatar project={project} character={character} size={24} decorative />
                          <VStack gap={0} hAlign="start">
                            <Link onClick={() => { selectPerson(character.id); openDossier(character.id); }}>
                              <Text weight="semibold" size="sm">{character.name}</Text>
                            </Link>
                            {character.billing && <Text type="supporting" color="secondary" size="xsm">{character.billing}</Text>}
                          </VStack>
                        </HStack>
                      )
                    },
                    ...structure.groups.map(act => ({
                      key: `act-${act.number}`,
                      header: act.shortLabel,
                      width: pixel(68),
                      align: 'end' as const,
                      renderCell: ({ byAct }: StageLoadRow) => {
                        const count = byAct.find(item => item.actNumber === act.number)?.scenes ?? 0;
                        return <Text color={count ? 'primary' : 'disabled'}>{count || '—'}</Text>;
                      }
                    })),
                    {
                      key: 'total',
                      header: 'Total',
                      width: pixel(72),
                      align: 'end',
                      renderCell: ({ totalScenes }) => <Text weight="semibold">{totalScenes}</Text>
                    }
                  ]}
                />
              }
              side={
                <VStack gap={3}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Glyph icon={Theater} size="sm" color="accent" />
                    <Heading level={4}>Doubling candidates</Heading>
                    <Token size="sm" color="gray" label="Generated · not canon" />
                  </HStack>
                  {stageReport.doublingPairs.length > 0 ? (
                    <VStack as="ul" gap={2} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {stageReport.doublingPairs.map(pair => (
                        <VStack as="li" key={`${pair.a.id}-${pair.b.id}`} gap={0} style={{ listStyle: 'none' }}>
                          <Card variant="muted" padding={3}>
                            <VStack gap={1} hAlign="start">
                              <HStack gap={2} align="center" wrap="wrap">
                                <Text weight="semibold" size="sm">{pair.a.name} / {pair.b.name}</Text>
                                <Badge variant="neutral" label={`${pair.combinedScenes} scenes`} />
                              </HStack>
                              <Text type="supporting" color="secondary" size="xsm">{pair.note}</Text>
                            </VStack>
                          </Card>
                        </VStack>
                      ))}
                    </VStack>
                  ) : (
                    <Text type="supporting" color="secondary">
                      Mark ensemble/featured roles and record scene appearances to surface non-overlapping doubling pairs.
                    </Text>
                  )}
                </VStack>
              }
            />
          </Pane>
        )}

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
                      const borderTone = check.kind === 'open-thread' || check.kind === 'turnaround' || check.kind === 'act-balance' ? 'var(--color-warning)'
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
