import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { Choice, Dialog, FormError, Pane } from './components';
import type { RevisionPreview } from './model';

const OMIT = '__omit__';

export function RevisionPanel({ preview, onApply, onClose, error }: {
  preview: RevisionPreview;
  onApply: (choices: Record<string, string | null>) => void;
  onClose: () => void;
  error?: string;
}) {
  const [choices, setChoices] = useState<Record<string, string | null>>(() => Object.fromEntries(preview.previous.flatMap<[string, string | null]>(match =>
    match.suggested ? [[match.scene.id, match.suggested.id]] : match.scene.status === 'omitted' ? [[match.scene.id, null]] : []
  )));
  const assigned = new Set(Object.values(choices).filter(Boolean));
  const added = preview.incoming.filter(item => !assigned.has(item.id));
  const valid = preview.previous.every(match => Object.hasOwn(choices, match.scene.id));
  return <Dialog title={`Review ${preview.snapshot.label}`} width={720} onClose={onClose}>
    <Text color="secondary">Confirm the source for each scene. An omission keeps its historical tags and shots. New scenes start without production links.</Text>
    <VStack gap={1}>
      {preview.previous.map(match => {
        const { scene, suggested } = match;
        const choice = choices[scene.id];
        const state = match.quality === 'review' ? 'Unmatched' : [
          match.moved && 'Moved', match.edited && 'Edited', match.quality === 'unique heading' && 'Heading match',
        ].filter(Boolean).join(' · ') || 'Unchanged';
        return <Item key={scene.id} label={`${scene.number} · ${scene.heading || 'Untitled scene'}`} description={state}
          endContent={<Choice label={`Incoming source for scene ${scene.number}`} isLabelHidden width={300} placeholder="Choose source"
            value={choice === null ? OMIT : choice ?? ''} onChange={value => setChoices(current => {
              if (value) return { ...current, [scene.id]: value === OMIT ? null : value };
              const next = { ...current };
              delete next[scene.id];
              return next;
            })}
            options={[{ value: OMIT, label: 'Omitted from this revision' }, ...preview.incoming.map(target => ({
              value: target.id, label: `${target.number} · ${target.heading || 'Untitled scene'}${suggested?.id === target.id ? ' (suggested)' : ''}`,
              isDisabled: assigned.has(target.id) && choice !== target.id
            }))]} />} />;
      })}
    </VStack>
    {!!added.length && <Pane variant="muted" title="Added scenes">
      <VStack gap={1}>{added.map(target => <Text key={target.id}>{target.number} · {target.heading || 'Untitled scene'}</Text>)}</VStack>
    </Pane>}
    <FormError>{error}</FormError>
    <HStack gap={2} justify="end">
      <Button label="Cancel" onClick={onClose} />
      <Button variant="primary" label="Apply reviewed revision" isDisabled={!valid} onClick={() => onApply(choices)} />
    </HStack>
  </Dialog>;
}
