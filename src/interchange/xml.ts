export interface XmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: Array<XmlNode | string>;
}

const names = /^[A-Za-z_][\w:.-]*/u;

export function escapeXml(text: string): string {
  // eslint-disable-next-line no-control-regex -- XML serialisation excludes disallowed control characters.
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const point = name.startsWith('#x') ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name] ?? entity;
  });
}

export function parseXml(source: string): XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('XML documents with declarations for external entities are unsupported.');
  const root: XmlNode = { tag: '', attributes: {}, children: [] };
  const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^<>'"]*(?:"[^"]*"|'[^']*'|[^<>'"])*>|[^<]+/gy;
  let position = 0;
  let budget = 500_000;
  while (position < source.length) {
    const token = tokens.exec(source)?.[0];
    if (!token || --budget < 0) throw new Error('Invalid or unusually large XML document.');
    position = tokens.lastIndex;
    const parent = stack[stack.length - 1];
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) {
      parent.children.push(token.slice(9, -3));
    } else if (token.startsWith('</')) {
      if (stack.length < 2 || parent.tag !== token.slice(2, -1).trim()) throw new Error('The XML tags do not match.');
      stack.pop();
    } else if (token.startsWith('<')) {
      const tag = names.exec(token.slice(1))?.[0];
      if (!tag || stack.length >= 128) throw new Error('Malformed or overly nested XML.');
      const attrs: Record<string, string> = Object.create(null);
      const remainder = token.slice(tag.length + 1, token.endsWith('/>') ? -2 : -1);
      const attribute = /\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;
      let end = 0;
      let match: RegExpExecArray | null;
      while ((match = attribute.exec(remainder))) {
        if (Object.hasOwn(attrs, match[1])) throw new Error('Duplicate XML attribute.');
        attrs[match[1]] = decodeXml(match[2] ?? match[3]);
        end = attribute.lastIndex;
      }
      if (remainder.slice(end).trim()) throw new Error('Malformed XML attribute.');
      const child = { tag, attributes: attrs, children: [] };
      parent.children.push(child);
      if (!token.endsWith('/>')) stack.push(child);
    } else {
      parent.children.push(decodeXml(token));
    }
  }
  const roots = elements(root);
  if (stack.length !== 1 || roots.length !== 1) throw new Error('Could not find a single XML document.');
  return roots[0];
}

export const localName = (tag: string) => tag.slice(tag.lastIndexOf(':') + 1);

export function elements(node: XmlNode | undefined, tag?: string): XmlNode[] {
  if (!node) return [];
  return node.children.filter((child): child is XmlNode => typeof child !== 'string' && (!tag || localName(child.tag) === tag));
}

export function element(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  return elements(node, tag)[0];
}

export function attr(node: XmlNode | undefined, name: string): string | undefined {
  return node && Object.entries(node.attributes).find(([key]) => localName(key) === name)?.[1];
}

export function xmlText(node: XmlNode | undefined): string {
  return node?.children.map(child => typeof child === 'string' ? child : xmlText(child)).join('') ?? '';
}

export const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
