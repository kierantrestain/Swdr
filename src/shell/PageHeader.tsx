import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Small uppercase context above the title, such as the project format. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** One line of context under the title: episode, draft, counts. */
  subtitle?: ReactNode;
  /** Page-level commands, right-aligned; the primary action goes last. */
  actions?: ReactNode;
  /** Extra notes under the subtitle, such as a draft warning. */
  children?: ReactNode;
  className?: string;
}

/**
 * The one page header every section uses, so titles, context and commands sit in the same place at the same
 * size across Overview, Script, Outline, Series Intelligence, Editorial, Production, Creator studio and Files.
 */
export function PageHeader({ eyebrow, title, subtitle, actions, children, className }: PageHeaderProps) {
  return <header className={className ? `page-heading ${className}` : 'page-heading'}>
    <div className="page-heading-text">
      {eyebrow && <Text type="supporting" className="page-eyebrow">{eyebrow}</Text>}
      <Heading level={1} textWrap="balance">{title}</Heading>
      {subtitle && <Text type="supporting" as="p" className="page-subtitle">{subtitle}</Text>}
      {children}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}
