/**
 * A deterministic feature-length Fountain screenplay ("Blind Spot") for production tests: scenes vary
 * from a few lines to several pages, characters recur at different rates and cues carry extensions.
 */
const SETS = [
  'INT. MAYA\'S APARTMENT - KITCHEN', 'EXT. HARBOUR ROAD', 'INT. POLICE STATION - BULLPEN', 'INT. HOSPITAL CORRIDOR',
  'EXT. MARINA', 'INT. DANIEL\'S CAR', 'INT. MAYA\'S APARTMENT - BEDROOM', 'EXT. ROOFTOP CAR PARK'
];
const TIMES = ['DAY', 'NIGHT', 'DAY', 'DUSK', 'NIGHT', 'DAWN'];
const CAST = ['MAYA', 'DANIEL', 'DET. OKAFOR', 'RUTH', 'THEO', 'DR. ELLIS'];
const LINES = [
  'You were there that night. Don\'t pretend you don\'t remember the road.',
  'I remember the lights. Then nothing. Then you, standing over me.',
  'The report says the car was already in the water when they found it.',
  'Reports say a lot of things. Most of them are written by people who weren\'t there.',
  'Then tell me what happened, and I\'ll stop asking.',
  'Some answers cost more than the question is worth.'
];

export function featureScript(sceneCount = 64): string {
  const out = ['Title: Blind Spot', 'Author: Test Writer', '', 'FADE IN:', ''];
  for (let scene = 0; scene < sceneCount; scene++) {
    const set = SETS[(scene * 5 + Math.floor(scene / 7)) % SETS.length];
    out.push(`${set} - ${TIMES[scene % TIMES.length]}`, '');
    out.push('Rain needles the glass. The room holds its breath, every surface a little too clean for what happened here.', '');
    const exchanges = 3 + (scene * 7) % 17;
    for (let line = 0; line < exchanges; line++) {
      const speaker = line % 2 === 0
        ? CAST[scene % 5 === 4 && line === 0 ? 1 : 0]
        : CAST[1 + ((scene + line) % (scene % 3 === 0 ? 5 : 3))];
      const extension = line === 2 ? ' (CONT\'D)' : scene % 11 === 3 && line === 1 ? ' (V.O.)' : scene % 13 === 5 && line === 0 ? ' (O.S.)' : '';
      out.push(`${speaker}${extension}`, LINES[(scene + line) % LINES.length], '');
      if (line % 3 === 2) out.push('A long pause. Somewhere outside, a siren rises and falls away into the traffic below the window.', '');
    }
  }
  if (sceneCount > 40) out.push('INT. CORONER\'S OFFICE - NIGHT', '', 'MR. HALE', 'Sign here. And here.', '');
  out.push('FADE OUT.', '');
  return out.join('\n');
}
