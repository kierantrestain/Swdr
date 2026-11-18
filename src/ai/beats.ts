/** Beats written as "I | Title | What happens" lines. */
export function parseBeats(text: string): Array<{ act: 1 | 2 | 3; title: string; notes: string }> {
  return text.split('\n').map(line => line.replace(/^[\s*•-]+/, '').match(/^(III|II|I)\s*[|:.-]\s*([^|]+?)\s*\|\s*(.+)$/)).filter(Boolean)
    .map(match => ({ act: (match![1].length as 1 | 2 | 3), title: match![2].trim(), notes: match![3].trim() }));
}

