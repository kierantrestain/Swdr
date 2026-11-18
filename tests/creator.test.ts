import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checks, chapters, clock, cutShort, hashtagList, newPiece, publishText, runtime, timeline, toAvRows } from '../src/creator/model';

test('beat timing comes from spoken words at the piece pace unless a beat sets its own length', () => {
  const piece = newPiece('shorts', 'Fast car');
  piece.wpm = 150;
  piece.beats[0].spoken = 'This chase cost less than your phone.'; // 7 words → 3s
  piece.beats[1].seconds = 20;
  piece.beats[2].spoken = 'Follow for part two.'; // 4 words → 2s
  assert.deepEqual(timeline(piece).map(beat => [beat.start, beat.end]), [[0, 3], [3, 23], [23, 25]]);
  assert.equal(runtime(piece), 25);
  assert.equal(clock(3725), '1:02:05');
  assert.equal(clock(65), '1:05');
  assert.deepEqual(checks(piece).filter(item => item.level === 'error'), []);
});

test('YouTube chapters start at 0:00, fold in the cold open and feed the description', () => {
  const video = newPiece('youtube', 'Car chase');
  video.beats = video.beats.map(beat => ({ ...beat, seconds: beat.kind === 'hook' ? 8 : 60 }));
  video.description = 'Every trick.';
  video.hashtags = 'filmmaking, #indie #indie';
  const list = chapters(video);
  assert.equal(list[0].start, 0);
  assert.equal(list[0].title, 'Intro');
  assert.equal(list[0].seconds, 68);
  assert.equal(list.length, 6);
  assert.deepEqual(hashtagList(video.hashtags), ['#filmmaking', '#indie']);
  assert.match(publishText(video), /^Every trick\.\n\nChapters\n0:00 Intro\n1:08 Chapter 1\n2:08 Chapter 2/);
  assert.match(publishText(video), /#filmmaking #indie$/);
});

test('checks catch a slow hook, an overlong short, a long title and short chapters', () => {
  const short = newPiece('reels', 'x'.repeat(10));
  short.beats[0].seconds = 6;
  short.beats[0].spoken = 'A slow opening line.';
  short.beats[1].seconds = 200;
  const messages = checks(short).map(item => item.message).join('\n');
  assert.match(messages, /hook runs 0:06/);
  assert.match(messages, /longer than Instagram Reels allows \(3:00\)/);

  const video = newPiece('youtube', 'y'.repeat(101));
  video.beats = video.beats.slice(0, 3).map(beat => ({ ...beat, seconds: 5, spoken: 'Words.' }));
  const long = checks(video).map(item => item.message).join('\n');
  assert.match(long, /101 characters; YouTube long-form allows 100/);
  assert.match(long, /at least three chapters/);
  assert.match(long, /must be at least 10 seconds/);
  assert.match(long, /call to action/);
});

test('a chapter can be cut into a short and any piece becomes AV rows', () => {
  const video = newPiece('youtube', 'Car chase');
  video.beats[2].spoken = 'Plan the route twice. Every corner gets a number.';
  video.beats[2].broll = 'Drone of the route';
  const short = cutShort(video, video.beats[2].id, 'tiktok');
  assert.equal(short.platform, 'tiktok');
  assert.equal(short.sourceId, video.id);
  assert.deepEqual(short.beats.map(beat => [beat.kind, beat.spoken]), [
    ['hook', 'Plan the route twice.'], ['cut', 'Every corner gets a number.'], ['convert', 'The full breakdown is on the channel — link in the description.']
  ]);
  const rows = toAvRows(video);
  assert.equal(rows.length, video.beats.length);
  assert.match(rows[2].video, /^CHAPTER — Chapter 1\nB-ROLL: Drone of the route$/);
  assert.equal(rows[2].audio, 'Plan the route twice. Every corner gets a number.');
});
