const ignored = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'filetbl',
  'listtable', 'listoverridetable', 'generator', 'fldinst', 'annotation', 'nonshppict', 'shp']);
const characterControls: Record<string, string> = {
  par: '\n', line: '\n', tab: '\t', emdash: '—', endash: '–', bullet: '•',
  lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' '
};

export function readRtf(source: string): string {
  if (!/^\s*\{\\rtf[1-9]/i.test(source)) throw new Error('The file does not contain a Rich Text Format document.');
  const pieces: string[] = [];
  const stack = [{ skip: false, unicodeFallback: 1 }];
  let fallback = 0;
  let encoding = new TextDecoder('windows-1252');
  const emit = (value: string) => {
    if (!stack[stack.length - 1]?.skip) {
      if (fallback) fallback--;
      else pieces.push(value);
    }
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const state = stack[stack.length - 1];
    if (char === '{') {
      if (stack.length >= 96) throw new Error('The RTF exceeds the supported nesting limit.');
      stack.push({ ...state });
    } else if (char === '}') {
      if (stack.length < 2) throw new Error('The RTF group braces do not match.');
      stack.pop();
      fallback = 0;
    } else if (char === '\\') {
      const next = source[index + 1];
      if (next === "'") {
        const hex = source.slice(index + 2, index + 4);
        if (/^[a-f\d]{2}$/i.test(hex)) {
          emit(encoding.decode(Uint8Array.of(Number.parseInt(hex, 16))));
          index += 3;
        }
      } else if (['{', '}', '\\', '~', '_', '-'].includes(next)) {
        emit(next === '~' ? ' ' : ['_', '-'].includes(next) ? '-' : next);
        index++;
      } else if (next === '*') {
        state.skip = true;
        index++;
      } else {
        const command = /^([A-Za-z]{1,40})(-?\d+)? ?/.exec(source.slice(index + 1, index + 90));
        if (!command) continue;
        index += command[0].length;
        const word = command[1].toLowerCase();
        const argument = Number(command[2]);
        if (ignored.has(word)) {
          state.skip = true;
        } else if (word === 'ansicpg' && Number.isInteger(argument) && argument >= 1250 && argument <= 1258) {
          encoding = new TextDecoder('windows-' + argument);
        } else if (word === 'bin' && Number.isInteger(argument) && argument >= 0) {
          index += argument;
        } else if (word === 'uc' && Number.isInteger(argument) && argument >= 0 && argument < 16) {
          state.unicodeFallback = argument;
        } else if (word === 'u' && Number.isInteger(argument) && !state.skip) {
          pieces.push(String.fromCharCode(argument & 0xffff));
          fallback = state.unicodeFallback;
        } else if (characterControls[word]) {
          emit(characterControls[word]);
        }
      }
    } else if (char !== '\r' && char !== '\n') {
      emit(char);
    }
  }
  if (stack.length !== 1) throw new Error('The RTF group braces do not match.');
  return pieces.join('').trim();
}
