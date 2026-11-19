import { Divider } from '@astryxdesign/core/Divider';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { CSSProperties } from 'react';
import type { Block } from '../model';

/** The script face, with the theme's code face behind it if Courier Prime has not loaded. */
const SCRIPT_FONT = "'Courier Prime', var(--font-family-code)";

/**
 * Screenplay indents as proportions of the line, the page's own ratios: the cue about a third in, dialogue inset a
 * quarter from the left and a seventh from the right. Proportions keep narrow previews and full pages both true.
 */
const INDENT: Partial<Record<Block['kind'], CSSProperties>> = {
  character: { marginInlineStart: '34%', marginBlockStart: 'var(--spacing-3)' },
  dialogue: { marginInline: '24% 14%' },
  parenthetical: { marginInline: '30% 20%' },
  transition: { textAlign: 'end' }
};

/** A scene's lines laid out like the script page, for sides and the breakdown preview. */
export function ScriptLines({ blocks }: { blocks: Block[] }) {
  return <VStack gap={1.5}>
    {blocks.map(block => <Text key={block.id} as="p" type="inherit" color="primary"
      style={{ fontFamily: SCRIPT_FONT, whiteSpace: 'pre-wrap', margin: 0, ...INDENT[block.kind] }}>{block.text}</Text>)}
  </VStack>;
}

/** Numbered scenes of an issued script, one after another, as they print on sides. */
export function ScriptExtract({ scenes }: { scenes: Array<{ id: string; number: string; heading: string; blocks: Block[] }> }) {
  return <VStack gap={4}>
    {scenes.map((scene, index) => <VStack as="section" key={scene.id} gap={2}>
      {index > 0 && <Divider />}
      <Text as="h3" type="inherit" color="primary" style={{ fontFamily: SCRIPT_FONT, fontWeight: 700, margin: 0 }}>
        {scene.number}{' '}{scene.heading}
      </Text>
      <ScriptLines blocks={scene.blocks.filter(block => block.kind !== 'scene')} />
    </VStack>)}
  </VStack>;
}
