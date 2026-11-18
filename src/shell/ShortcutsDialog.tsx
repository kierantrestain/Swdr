import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Table, TableBody, TableCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { SHORTCUT_GROUPS } from './shortcuts';

function Keys({ keys }: { keys: string[] }) {
  return <span className="shell-keys">{keys.map((combo, index) => <span key={combo} className="shell-keys-option">
    {index > 0 && <Text type="supporting">or</Text>}
    {combo.split(' ').map((step, position) => <span key={step + position} className="shell-keys-option">
      {position > 0 && <Text type="supporting">then</Text>}
      <Kbd keys={step} />
    </span>)}
  </span>)}</span>;
}

export function ShortcutsDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={760} maxHeight="86dvh">
    <Layout
      header={<DialogHeader title="Keyboard shortcuts" subtitle="Press ? anywhere outside a text field to open this list." onOpenChange={onOpenChange} />}
      content={<LayoutContent>
        <div className="shell-shortcut-groups">
          {SHORTCUT_GROUPS.map(group => <section key={group.title} className="shell-shortcut-group">
            <Heading level={3}>{group.title}</Heading>
            <Table density="compact" dividers="rows">
              <TableBody>
                {group.shortcuts.map(shortcut => <TableRow key={shortcut.label}>
                  <TableCell><Text type="body">{shortcut.label}</Text></TableCell>
                  <TableCell><Keys keys={shortcut.keys} /></TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </section>)}
        </div>
      </LayoutContent>}
    />
  </Dialog>;
}
