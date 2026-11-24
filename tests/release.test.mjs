import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { assertNoSecret } from '../scripts/check.mjs';

const source = await readFile(new URL('../site/assets/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Missing source boundaries for ${from}`);
  return source.slice(start, end);
}

test('credential scan detects keys without exposing their values', () => {
  const secret = ['sk', 'proj', 'a'.repeat(40)].join('-');
  assert.throws(() => assertNoSecret(secret, 'test fixture'), error => {
    assert.ok(error.message.includes('test fixture'));
    assert.ok(!error.message.includes(secret));
    return true;
  });
  assert.throws(() => assertNoSecret('ghp_' + 'b'.repeat(36), 'test fixture'));
  assert.doesNotThrow(() => assertNoSecret('OPENAI_API_KEY is a future server secret name.', 'documentation'));
});

test('profile code stays offline and pages reject inline execution', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|innerHTML|outerHTML|insertAdjacentHTML|document\.write\s*\(/);
  assert.ok(html.includes("connect-src 'self'"));
  assert.ok(html.includes("script-src 'self'"));
  assert.ok(html.includes("form-action 'none'"));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https:\/\/[^"\s]+\.(?:js|css)["\s]/);
  assert.ok(html.includes('src="./assets/app.js" defer'));
});

test('every cited answer points to the approved HTTPS authorities', async () => {
  const library = JSON.parse(await readFile(new URL('../shared/library.json', import.meta.url), 'utf8'));
  const allowed = new Set(['www.nimh.nih.gov', 'www.nhs.uk', 'www.nice.org.uk', 'www.moh.gov.sa', 'www.who.int', 'www.niddk.nih.gov', 'www.healthdirect.gov.au', 'www2.hse.ie', 'ods.od.nih.gov', 'www.samhsa.gov', 'medlineplus.gov']);
  for (const item of Object.values(library.medicalSources)) {
    const url = new URL(item.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(allowed.has(url.hostname), `Unreviewed authority: ${url.hostname}`);
  }
  for (const [answerId, answer] of Object.entries(library.medicalAnswers)) {
    if (answerId !== 'plan') assert.ok(answer.sources.length > 0);
    for (const id of answer.sources) assert.ok(Object.hasOwn(library.medicalSources, id), `Unknown citation ${id}`);
  }
});

test('turning off snacks cannot remove meals and preserves saved times', () => {
  const fixture = { settings: { meals: false, snacks: false, water: false }, times: { breakfast: '09:10', morning: '11:15' } };
  const context = { record: () => fixture };
  const code = section('const mealSlots =', 'const defaultWindow =') + section('function activeEatingSlots(', 'function formatTime(');
  const result = runInNewContext(code + ';schedule();', { ...context });
  assert.deepEqual(Array.from(result, slot => slot.id), ['breakfast', 'lunch', 'dinner']);
  assert.equal(result[0].time, '09:10');
  fixture.settings.snacks = true;
  const restored = runInNewContext(code + ';schedule();', { ...context });
  assert.equal(restored.length, 6);
  assert.equal(restored.find(slot => slot.id === 'morning').time, '11:15');
});

test('daily check-in dates follow the visitor time zone across midnight', () => {
  const code = section('function dayKey(', 'function localClock(');
  const date = new Date('2026-11-20T00:30:00Z');
  const result = runInNewContext(code + ';[dayKey(date, "America/Los_Angeles"), dayKey(date, "Asia/Riyadh")];', { date });
  assert.deepEqual(Array.from(result), ['2026-11-19', '2026-11-20']);
});

test('calendar reminders respect fractional offsets and daylight saving', () => {
  const code = section('function zonedToUtc(', 'function calendarText(');
  for (const [day, time, zone, expected] of [
    ['2026-11-20', '08:00', 'Asia/Riyadh', '2026-11-20T05:00:00.000Z'],
    ['2026-11-20', '08:00', 'Asia/Kathmandu', '2026-11-20T02:15:00.000Z'],
    ['2026-07-20', '08:00', 'America/New_York', '2026-07-20T12:00:00.000Z'],
    ['2026-12-20', '08:00', 'America/New_York', '2026-12-20T13:00:00.000Z']
  ]) {
    assert.equal(runInNewContext(code + ';zonedToUtc(day, time, zone).toISOString();', { day, time, zone }), expected);
  }
});

test('failed check-in saves roll back instead of falsely claiming success', () => {
  const data = { checkins: [] };
  const status = {};
  const context = {
    profile: { id: 'synthetic-test' }, guidedState: { answers: {}, note: 'Test note' },
    crypto: { randomUUID: () => 'synthetic-entry' }, captureGuided() {}, dayKey: () => '2026-11-20',
    zone: () => 'Asia/Riyadh', interfaceLocale: () => 'en', record: () => data,
    persist: () => false, byId: () => status,
    resetGuided: () => assert.fail('Must not clear unsaved answers'),
    renderHistory: () => assert.fail('Must not show a saved entry'), renderDailyPrompt() {}
  };
  runInNewContext(section('function saveGuided()', 'function renderDailyPrompt(') + ';saveGuided();', context);
  assert.equal(data.checkins.length, 0);
  assert.ok(status.textContent.includes('couldn’t be saved'));
});

test('the calendar test downloads one real alarm five minutes ahead without using a meal plan', () => {
  const now=new Date('2026-11-24T23:58:10Z');
  const content=runInNewContext(section('function calendarTestEvent(', 'function downloadFile(')
    + ';calendarTestEvent(now);', {now,crypto,translate:key=>key});
  assert.equal((content.match(/BEGIN:VEVENT/g) || []).length,1);
  assert.ok(content.includes('DTSTART:20261125T000310Z\r\n'));
  assert.ok(content.includes('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0S\r\n'));
  assert.ok(content.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.match(html,/id="test-calendar"/);
});
