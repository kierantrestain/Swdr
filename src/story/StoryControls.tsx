import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Card } from '@astryxdesign/core/Card';
import { Dialog as AstryxDialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid, GridSpan } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ArrowUpRight, Link2, X } from 'lucide-react';
import type { ComponentType, PropsWithChildren, ReactNode, SVGProps } from 'react';
import { sceneList } from '../model';
import type { DocumentModel, Project, SourceRef } from '../model';
import { exactSource, sourceDocument, sourceLabel } from './source';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** Icons sit cleanly on the text baseline; the reset would otherwise make them block-level. */
const INLINE_GLYPH = { display: 'inline-block', verticalAlign: '-0.125em', flex: 'none' } as const;

/** A lucide icon rendered through Astryx Icon so it takes theme sizing and semantic colour tokens. */
export function Glyph({ icon, size = 'sm', color }: {
  icon: IconComponent;
  size?: 'xsm' | 'sm' | 'md' | 'lg';
  color?: 'secondary' | 'accent' | 'warning' | 'error' | 'success';
}) {
  return <Icon icon={icon} size={size} color={color} style={INLINE_GLYPH} />;
}

/** A count beside a heading or tab. */
export function Count({ value, tone = 'neutral', label }: {
  value: number;
  tone?: 'neutral' | 'warning' | 'error' | 'info' | 'success';
  label?: string;
}) {
  return <Badge variant={tone} label={String(value)} aria-label={label} />;
}

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

/** Single-choice selector built on Astryx Selector. */
export function Choice({ label, value, options, onChange, placeholder, isLabelHidden, width, isDisabled, description, size }: {
  label: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  isLabelHidden?: boolean;
  width?: number | string;
  isDisabled?: boolean;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return <Selector
    label={label}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    isLabelHidden={isLabelHidden}
    width={width}
    isDisabled={isDisabled}
    description={description}
    size={size}
    options={options.map(option => ({ value: option.value, label: option.label, description: option.description, disabled: option.isDisabled }))}
  />;
}

/** A heading with optional supporting context and right-aligned actions. */
export function PaneHeading({ title, description, actions, level = 2 }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3 | 4;
}) {
  return <HStack gap={3} justify="between" align="start" wrap="wrap">
    <VStack gap={0.5} style={{ minWidth: 0, flex: '1 1 16rem' }}>
      {title && <Heading level={level}>{title}</Heading>}
      {description && <Text type="supporting" color="secondary">{description}</Text>}
    </VStack>
    {actions && <HStack gap={2} align="center" wrap="wrap">{actions}</HStack>}
  </HStack>;
}

/** A titled working surface inside Series Intelligence or Editorial. */
export function Pane({ title, description, actions, label, children, variant, level = 2, padding = 5, elevation }: PropsWithChildren<{
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  label?: string;
  variant?: 'default' | 'muted';
  level?: 2 | 3 | 4;
  padding?: 3 | 4 | 5 | 6;
  elevation?: 'none' | 'low' | 'med';
}>) {
  return <Card role={label ? 'region' : undefined} aria-label={label} variant={variant} padding={padding} elevation={elevation}>
    <VStack gap={4}>
      {(title || actions || description) && <PaneHeading title={title} description={description} actions={actions} level={level} />}
      {children}
    </VStack>
  </Card>;
}

/** Two working surfaces side by side on wide screens, stacked cleanly below the breakpoint. */
export function Split({ main, side, ratio = [7, 4], breakpoint = 1120 }: {
  main: ReactNode;
  side?: ReactNode;
  ratio?: [number, number];
  breakpoint?: number;
}) {
  const wide = useMediaQuery(`(min-width: ${breakpoint}px)`);
  if (!side) return <>{main}</>;
  return wide
    ? <Grid columns={ratio[0] + ratio[1]} gap={4} align="start">
        <GridSpan columns={ratio[0]}>{main}</GridSpan>
        <GridSpan columns={ratio[1]}>{side}</GridSpan>
      </Grid>
    : <VStack gap={4}>{main}{side}</VStack>;
}

/** An error banner announced immediately to assistive technology. */
export function FormError({ children }: { children?: string }) {
  return children ? <Banner status="error" title={children} role="alert" /> : null;
}

/** Empty state inside a workspace card. */
export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <EmptyState title={title} description={description} actions={action} />;
}

/** Modal working surface for creating or editing story and editorial records. */
export function StoryDialog({ title, subtitle, onClose, width = 640, children }: PropsWithChildren<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number | string;
}>) {
  return <AstryxDialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={width} maxHeight="90dvh" purpose="form">
    <DialogHeader title={title} subtitle={subtitle} endContent={<IconButton variant="ghost" label="Close dialog" icon={<Glyph icon={X} />} onClick={onClose} />} />
    <VStack gap={4} padding={5}>{children}</VStack>
  </AstryxDialog>;
}

export function initialSource(project: Project, document: DocumentModel): SourceRef | undefined {
  const screenplay = sceneList(document).length ? document : project.documents.find(item => sceneList(item).length);
  return screenplay && exactSource(project, screenplay, sceneList(screenplay)[0].blockId);
}

/** Three linked Astryx Selectors choosing an exact immutable script line. */
export function SourceFields({ project, value, onChange }: {
  project: Project;
  value?: SourceRef;
  onChange: (source: SourceRef | undefined) => void;
}) {
  const documents = project.documents.filter(document => sceneList(document).length);
  const selected = value && sourceDocument(project, value);
  const retained = selected && !documents.some(document => document.id === selected.id && document.revisionId === selected.revisionId);
  const entries = retained ? [selected, ...documents] : documents;
  const key = (document: DocumentModel) => `${document.id}:${document.revisionId}`;
  const scenes = selected ? sceneList(selected) : [];
  const start = scenes.find(scene => scene.id === value?.sceneId);
  const end = start && scenes.find(scene => scene.index > start.index)?.index;
  const blocks = start && selected ? selected.blocks.slice(start.index, end) : [];

  return <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={3}>
    <Choice
      label="Source script"
      value={selected ? key(selected) : ''}
      placeholder="Select a script with a scene"
      onChange={nextKey => {
        const document = entries.find(item => key(item) === nextKey);
        onChange(document && exactSource(project, document, sceneList(document)[0].blockId));
      }}
      options={entries.map(document => ({
        value: key(document),
        label: `${document.title}${!documents.includes(document) ? ' · Retained revision' : ''}`
      }))}
    />
    <Choice
      label="Source scene"
      value={value?.sceneId ?? ''}
      isDisabled={!selected}
      placeholder="Select a scene"
      onChange={sceneId => {
        if (selected) onChange(exactSource(project, selected, scenes.find(scene => scene.id === sceneId)?.blockId));
      }}
      options={scenes.map(scene => ({ value: scene.id, label: `${scene.number} · ${scene.heading || 'Untitled scene'}` }))}
    />
    <Choice
      label="Exact source line"
      value={value?.blockId ?? ''}
      isDisabled={!start}
      placeholder="Select a line"
      onChange={blockId => {
        if (selected) onChange(exactSource(project, selected, blockId));
      }}
      options={blocks.map((block, index) => ({
        value: block.id,
        label: `${(start?.index ?? 0) + index + 1} · ${block.text.slice(0, 95) || block.kind}`
      }))}
    />
  </Grid>;
}

/** Opens the exact scene and script line behind a record, preserving button semantics for in-app navigation. */
export function SourceButton({ project, source, onOpen, label }: {
  project: Project;
  source: SourceRef;
  onOpen: (source: SourceRef) => void;
  label?: string;
}) {
  const text = label || sourceLabel(project, source);
  return <Link onClick={() => onOpen(source)} aria-description={`Revision ${source.revisionId}`}>
    <HStack as="span" gap={1} align="center" style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
      <Glyph icon={Link2} size="xsm" />
      <Text as="span" type="supporting" color="accent">{text}</Text>
      <Glyph icon={ArrowUpRight} size="xsm" />
    </HStack>
  </Link>;
}
