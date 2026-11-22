import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Card } from '@astryxdesign/core/Card';
import { Dialog as AstryxDialog } from '@astryxdesign/core/Dialog';
import { DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid, GridSpan } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { Theme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/VStack';
import { ArrowUpRight, X } from 'lucide-react';
import type { ComponentType, PropsWithChildren, ReactNode, SVGProps } from 'react';
import { defaultThemeSlug, themes } from '../astryx-themes';
import type { Project, Snapshot, SourceRef, WorkspaceViewProps } from '../model';
import type { ProductionOutput, ProductionPlan, ScriptChange } from './model';

export interface PaneProps {
  /** Scenes whose writing draft differs from the issued snapshot used by production. */
  changes: ScriptChange[];
  /** Opens the release flow to issue the latest draft and review its production links. */
  reviewScript?: () => void;
  project: Project;
  plan: ProductionPlan;
  snapshot: Snapshot;
  source: SourceRef;
  readOnly?: boolean;
  update: (change: (plan: ProductionPlan, project: Project) => ProductionPlan, message?: string) => boolean;
  /** Builds or refreshes cast, locations and page counts from the issued script. */
  syncScript?: () => void;
  /** Changes the project and this plan together, such as adding a photo asset and linking it. */
  updateProject: (change: (project: Project, plan: ProductionPlan) => Project, message?: string) => boolean;
  onOpenSource: WorkspaceViewProps['onOpenSource'];
  onProjectChange: WorkspaceViewProps['onProjectChange'];
  onStatus: WorkspaceViewProps['onStatus'];
  issueOutput: (kind: ProductionOutput['kind'], filename: string, content: string) => void;
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** Icons sit on the text line they belong to; the reset would otherwise make them block-level. */
const INLINE_GLYPH = { display: 'inline-block', verticalAlign: '-0.125em', flex: 'none' } as const;

/** A lucide glyph rendered through Astryx Icon, so it takes the theme's icon sizing and colour. */
export function Glyph({ icon, size = 'sm', color }: { icon: IconComponent; size?: 'xsm' | 'sm' | 'md' | 'lg'; color?: 'secondary' | 'accent' | 'warning' | 'error' | 'success' }) {
  return <Icon icon={icon} size={size} color={color} style={INLINE_GLYPH} />;
}

/**
 * Opens the exact scene and line in the issued script that a production item came from. A link-styled button: it
 * wraps with the text around it, and keeps button semantics because it acts in the app rather than navigating.
 */
export function SourceButton({ source, onOpenSource, children, label }: PropsWithChildren<{
  source: SourceRef;
  onOpenSource: PaneProps['onOpenSource'];
  /** Accessible name when the visible text is not enough on its own. */
  label?: string;
}>) {
  return <Link label={label} onClick={() => onOpenSource(source)}>
    {children || 'Source'}{'\u00a0'}<Glyph icon={ArrowUpRight} size="xsm" />
  </Link>;
}

/**
 * Two working regions side by side. Responsive contract: from 1280px of window width the regions share the row in the
 * given ratio (main three fifths, side two by default); below that the side region drops beneath the main one at full
 * width. With no side region (read-only views) the main region takes the full width.
 */
export function Split({ main, side, ratio = [3, 2] }: { main: ReactNode; side?: ReactNode; ratio?: [number, number] }) {
  const wide = useMediaQuery('(min-width: 1280px)');
  if (!side) return <>{main}</>;
  return wide
    ? <Grid columns={ratio[0] + ratio[1]} gap={4} align="start"><GridSpan columns={ratio[0]}>{main}</GridSpan><GridSpan columns={ratio[1]}>{side}</GridSpan></Grid>
    : <VStack gap={4}>{main}{side}</VStack>;
}

/** An empty or not-yet-ready state inside a pane. */
export function Empty({ children, action, title }: { children: string; action?: ReactNode; title?: string }) {
  return <EmptyState title={title ?? children} description={title ? children : undefined} actions={action} />;
}

/** A titled working surface inside a production pane. */
export function Pane({ title, description, actions, label, children, variant, level = 3 }: PropsWithChildren<{
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Names the pane as a landmark region for assistive technology. */
  label?: string;
  variant?: 'default' | 'muted';
  level?: 2 | 3;
}>) {
  return <Card role={label ? 'region' : undefined} aria-label={label} variant={variant} padding={5}>
    <VStack gap={4}>
      {(title || actions) && <PaneHeading title={title} description={description} actions={actions} level={level} />}
      {children}
    </VStack>
  </Card>;
}

/** A heading with an optional line of context and right-aligned commands. */
export function PaneHeading({ title, description, actions, level = 3 }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3 | 4;
}) {
  return <HStack gap={3} justify="between" align="start" wrap="wrap">
    <VStack gap={0.5}>
      {title && <Heading level={level}>{title}</Heading>}
      {description && <Text type="supporting" color="secondary">{description}</Text>}
    </VStack>
    {actions && <HStack gap={2} align="center" wrap="wrap">{actions}</HStack>}
  </HStack>;
}

/** An operation that could not be completed, announced to assistive technology as it appears. */
export function FormError({ children }: { children?: string }) {
  return children ? <Banner status="error" title={children} role="alert" /> : null;
}

/** A count beside a label, such as open conflicts or people in a directory. */
export function Count({ value, tone = 'neutral', label }: { value: number; tone?: 'neutral' | 'warning' | 'error' | 'info'; label?: string }) {
  return <Badge variant={tone} label={String(value)} aria-label={label} />;
}

export interface ChoiceOption { value: string; label: string; description?: string; isDisabled?: boolean }

/** A single choice from a list: Astryx Selector with plain value/label options. */
export function Choice({ label, value, options, onChange, placeholder, isLabelHidden, width, isDisabled, description }: {
  label: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  isLabelHidden?: boolean;
  width?: number | string;
  isDisabled?: boolean;
  description?: string;
}) {
  return <Selector label={label} value={value} onChange={onChange} placeholder={placeholder} isLabelHidden={isLabelHidden}
    width={width} isDisabled={isDisabled} description={description}
    options={options.map(option => ({ value: option.value, label: option.label, description: option.description, disabled: option.isDisabled }))} />;
}

/**
 * A modal working surface. `print` marks it as a printable document: everything outside its paper is hidden when
 * printing (see print.css), and the paper itself stays light in either appearance.
 */
export function Dialog({ title, onClose, print, width = 720, children }: PropsWithChildren<{
  title: string;
  onClose: () => void;
  print?: boolean;
  width?: number | string;
}>) {
  return <AstryxDialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={width} maxHeight="88dvh" purpose="form"
    className={print ? 'production-print' : undefined}>
    <Layout
      header={<DialogHeader title={title} endContent={<IconButton variant="ghost" label="Close preview" icon={<Glyph icon={X} />} onClick={onClose} />} />}
      content={<LayoutContent><VStack gap={4}>{children}</VStack></LayoutContent>}
    />
  </AstryxDialog>;
}

/** Printed paper (call sheets, sides): always the light theme, so it reads as the page it prints on. */
export function Paper({ children, label }: PropsWithChildren<{ label?: string }>) {
  return <Theme theme={themes[defaultThemeSlug]} mode="light">
    <Card role={label ? 'region' : undefined} aria-label={label} className="production-print-document" padding={6} elevation="low">{children}</Card>
  </Theme>;
}

export function downloadText(filename: string, content: string) {
  const type = filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : filename.endsWith('.json') ? 'application/json' : 'text/plain;charset=utf-8';
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function displayDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(parsed);
}
