import { Badge } from '@astryxdesign/core/Badge';
import { Blockquote } from '@astryxdesign/core/Blockquote';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { Project, WorkspaceViewProps } from '../model';
import { CLAIM_LANES, claimBoard } from './editorial-model';
import type { ClaimLane, EditorialStore, EvidenceState } from './editorial-model';
import { Glyph, PaneHeading, SourceButton } from './StoryControls';
import { sourceText } from './source';

const LANE_NOTES: Record<ClaimLane, string> = {
  Unsourced: 'No evidence linked yet',
  Sourced: 'Evidence linked · verification pending',
  Verified: 'Cleared for the host to say',
  Disputed: 'Claim or a linked source is contested'
};

const LANE_BORDER: Record<ClaimLane, string> = {
  Unsourced: 'var(--color-border-emphasized)',
  Sourced: 'var(--color-warning)',
  Verified: 'var(--color-success)',
  Disputed: 'var(--color-error)'
};

const STATUS_DOT: Record<EvidenceState, 'success' | 'warning' | 'error'> = {
  Verified: 'success',
  'Check required': 'warning',
  Contested: 'error'
};

function safeURL(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export function ClaimBoard({ project, store, documentId, onOpen, openSegment, correct }: {
  project: Project;
  store: EditorialStore;
  documentId: string;
  onOpen: WorkspaceViewProps['onOpenSource'];
  openSegment: (documentId: string, segmentId: string) => void;
  correct?: (claimId: string) => void;
}) {
  const [scope, setScope] = useState<'episode' | 'series'>('series');
  const all = claimBoard(project, store);
  const cards = scope === 'series' ? all : all.filter(card => card.uses.some(use => use.documentId === documentId)
    || card.version.scriptLine?.documentId === documentId);
  const asset = (id?: string) => id ? project.assets.find(item => item.id === id) : undefined;

  return <VStack as="section" gap={4} aria-label="Claim verification">
    <PaneHeading
      title="Claim verification"
      description={CLAIM_LANES.map(lane => `${cards.filter(card => card.lane === lane).length} ${lane.toLowerCase()}`).join(' · ')}
      level={2}
      actions={<SegmentedControl label="Claim scope" size="sm" value={scope} onChange={value => setScope(value as 'episode' | 'series')}>
        <SegmentedControlItem value="episode" label="This episode" />
        <SegmentedControlItem value="series" label="Whole series" />
      </SegmentedControl>}
    />

    <Grid columns={{ minWidth: 250, repeat: 'fit' }} gap={3} align="start">
      {CLAIM_LANES.map(lane => {
        const entries = cards.filter(card => card.lane === lane);
        return <Card
          key={lane}
          variant="muted"
          padding={4}
          role="region"
          aria-label={`${lane} claims`}
          style={{ borderTop: `3px solid ${LANE_BORDER[lane]}` }}
        >
          <VStack gap={3}>
            <VStack gap={0.5}>
              <HStack justify="between" align="center">
                <Heading level={3}>{lane}</Heading>
                <Badge variant={lane === 'Verified' ? 'success' : lane === 'Disputed' ? 'error' : lane === 'Sourced' ? 'warning' : 'neutral'} label={String(entries.length)} />
              </HStack>
              <Text type="supporting" color="secondary" size="xsm">{LANE_NOTES[lane]}</Text>
            </VStack>

            {entries.map(card => {
              const usedEpisodes = new Set(card.uses.map(use => use.documentId)).size;
              return <Card role="article" key={card.id} padding={4} aria-label={card.version.text}>
                <VStack gap={3} hAlign="start">
                  <VStack gap={1}>
                    <Heading level={4}>{card.version.text}</Heading>
                    <Text type="supporting" color="secondary" size="xsm">
                      Marked {card.version.status}{card.corrections ? ` · ${card.corrections} correction${card.corrections === 1 ? '' : 's'}` : ''}
                    </Text>
                  </VStack>

                  {card.warnings.length > 0 && <VStack as="ul" gap={1} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {card.warnings.map(warning => (
                      <HStack as="li" key={warning} gap={1.5} align="start" style={{ listStyle: 'none' }}>
                        <Glyph icon={AlertTriangle} size="xsm" color="warning" />
                        <Text type="supporting" size="xsm" style={{ color: 'var(--color-text-warning)' }}>{warning}</Text>
                      </HStack>
                    ))}
                  </VStack>}

                  <VStack gap={1.5} style={{ width: '100%' }}>
                    <Text type="label" color="secondary" size="xsm">Evidence</Text>
                    {card.sources.length > 0 ? <VStack as="ul" gap={1.5} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {card.sources.map(({ id, version }) => {
                        const href = safeURL(version.url);
                        const file = asset(version.assetId);
                        return <HStack as="li" key={id} gap={2} align="start" style={{ listStyle: 'none' }}>
                          <StatusDot variant={STATUS_DOT[version.status]} label={version.status} />
                          <VStack gap={0} hAlign="start">
                            <Text weight="semibold" size="sm">{version.title}</Text>
                            <Text type="supporting" color="secondary" size="xsm">
                              {[version.status, version.locator].filter(Boolean).join(' · ')}
                            </Text>
                            {href && <Link href={href} target="_blank" rel="noopener noreferrer">Open source</Link>}
                            {!href && file && <Link href={file.dataUrl} label={`Open ${file.name}`}>Open {file.name}</Link>}
                          </VStack>
                        </HStack>;
                      })}
                    </VStack> : <Text type="supporting" color="secondary" size="xsm">No linked evidence.</Text>}
                  </VStack>

                  {card.version.scriptLine && <VStack gap={1.5} hAlign="start" style={{ width: '100%' }}>
                    <Text type="label" color="secondary" size="xsm">Script line</Text>
                    <Blockquote>{sourceText(project, card.version.scriptLine) || 'Linked line'}</Blockquote>
                    <SourceButton project={project} source={card.version.scriptLine} onOpen={onOpen} />
                  </VStack>}

                  <VStack gap={1.5} hAlign="start" style={{ width: '100%' }}>
                    <Text type="label" color="secondary" size="xsm">
                      Used in {usedEpisodes} episode{usedEpisodes === 1 ? '' : 's'}
                    </Text>
                    <HStack gap={1} wrap="wrap">
                      {card.uses.slice(0, 4).map(use => (
                        <Button
                          key={`${use.documentId}:${use.segmentId}`}
                          size="sm"
                          variant="ghost"
                          label={`Open ${use.segmentTitle} in ${use.episode}`}
                          onClick={() => openSegment(use.documentId, use.segmentId)}
                        >
                          {use.episode} · {use.segmentTitle}
                        </Button>
                      ))}
                      {card.uses.length > 4 && (
                        <Token size="sm" color="gray" label={`+${card.uses.length - 4} more segments`} />
                      )}
                    </HStack>
                  </VStack>

                  {correct && <Button size="sm" label="Correct claim" onClick={() => correct(card.id)} />}
                </VStack>
              </Card>;
            })}

            {!entries.length && <Text type="supporting" color="secondary" size="xsm">None</Text>}
          </VStack>
        </Card>;
      })}
    </Grid>
  </VStack>;
}
