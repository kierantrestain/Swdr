import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Item } from '@astryxdesign/core/Item';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Download } from 'lucide-react';
import { Empty, Glyph, Pane, SourceButton, displayDate, downloadText } from './components';
import type { PaneProps } from './components';
import { Budget } from './Budget';
import { castNumbers, dayOutOfDays, doodCsv, productionManifest } from './model';

export type ReportSection = 'Day out of days' | 'Budget' | 'Issued exports';

/** The report on show is held by the production view, so its title, address and sidebar follow it. */
export function Reports({ section: tab, onSectionChange: setTab, ...pane }: PaneProps & {
  section: ReportSection;
  onSectionChange: (section: ReportSection) => void;
}) {
  const { project, plan, readOnly, onOpenSource, issueOutput } = pane;
  const { dates, rows } = dayOutOfDays(plan);
  const castIds = castNumbers(plan);
  return <VStack gap={4}>
    <SegmentedControl label="Production reports" value={tab} onChange={value => setTab(value as ReportSection)}>
      {(['Day out of days', 'Budget', 'Issued exports'] as const).map(name => <SegmentedControlItem key={name} value={name} label={name} />)}
    </SegmentedControl>
    {tab === 'Day out of days' && <Pane title="Day out of days" description="SW Start work · W Work · WF Work finish · SWF Start/work/finish · H Paid hold"
      actions={!readOnly && dates.length > 0 && rows.length > 0 && <Button label="Export day out of days" icon={<Glyph icon={Download} />}
        onClick={() => issueOutput('dood', 'swdr-day-out-of-days.csv', doodCsv(project, plan))} />}>
      {!dates.length || !rows.length ? <Empty>Cast and dated shoot days are needed to calculate the report.</Empty> :
        <Table density="compact">
          <TableHeader><TableRow isHeaderRow>
            <TableHeaderCell>ID</TableHeaderCell><TableHeaderCell>Cast</TableHeaderCell>
            {dates.map(date => <TableHeaderCell key={date}>{displayDate(date)}</TableHeaderCell>)}
            <TableHeaderCell style={{ textAlign: 'end' }}>Worked days</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{rows.map(row => <TableRow key={row.person.id}>
            <TableCell><Badge label={String(castIds.get(row.person.id) ?? '—')} /></TableCell>
            <TableHeaderCell scope="row">{row.person.name}</TableHeaderCell>
            {row.codes.map((code, index) => <TableCell key={dates[index]}>{code === '—' ? <Text color="secondary">—</Text> : <Badge variant="info" label={code} />}</TableCell>)}
            <TableCell style={{ textAlign: 'end' }}>{row.worked}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
    </Pane>}
    {tab === 'Budget' && <Budget {...pane} />}
    {tab === 'Issued exports' && <Pane title="Issued exports" description="Issued exports are saved as versioned copies of the production data."
      actions={!readOnly && <>
        <Button label="Issue prep export" icon={<Glyph icon={Download} />} onClick={() => issueOutput('prep', 'swdr-production-prep.json', productionManifest(project, plan, 'prep'))} />
        <Button label="Issue wrap export" icon={<Glyph icon={Download} />} onClick={() => issueOutput('wrap', 'swdr-production-wrap.json', productionManifest(project, plan, 'wrap'))} />
      </>}>
      {!plan.outputs.length ? <Text color="secondary">Nothing issued yet.</Text> : <VStack gap={1}>
        {[...plan.outputs].reverse().map(output => <Item key={output.id} label={output.filename} description={`${output.issuedAt.slice(0, 10)} · ${output.kind}`}
          endContent={<HStack gap={3} align="center">
            <SourceButton source={output.source} onOpenSource={onOpenSource} />
            <Button label="Download" icon={<Glyph icon={Download} />} onClick={() => downloadText(output.filename, output.content)} />
          </HStack>} />)}
      </VStack>}
    </Pane>}
  </VStack>;
}
