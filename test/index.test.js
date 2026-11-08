import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codes, yearLetters, getCode, parsePlate, lookupPlate } from '../index.js';
import { readFile } from 'node:fs/promises';
import { buildData, cellItems, cleanWikitext, expandHistory, parseItem, toCsv } from '../scripts/build-data.mjs';

const names = (authorities) => authorities.map((a) => a.name);

test('getCode finds codes in any case and with spaces', () => {
  assert.equal(getCode(' hp ').code, 'HP');
  assert.deepEqual(names(getCode('A').authorities), ['London']);
  assert.equal(getCode('QQ'), undefined);
});

test('parsePlate recognises each format and its area code', () => {
  const cases = [
    ['A 1', 'dateless', 'A'],
    ['ND 7102', 'dateless', 'ND'],
    ['DHP 551', 'three-letter', 'HP'],
    ['AXZ 1234', 'three-letter', 'XZ'],
    ['1 A', 'reversed', 'A'],
    ['1234 AB', 'reversed', 'AB'],
    ['123 ABC', 'reversed', 'BC'],
    ['ABC 123D', 'suffix', 'BC'],
    ['A123 BCD', 'prefix', 'CD'],
    ['ab12-cde', 'current', null],
  ];
  for (const [plate, format, areaCode] of cases) {
    const p = parsePlate(plate);
    assert.equal(p.format, format, plate);
    assert.equal(p.areaCode, areaCode, plate);
  }
});

test('parsePlate rejects text that is not a registration mark', () => {
  for (const plate of ['', 'HELLO', '12345', 'AB 12345', 'A1B2C3', 'AA 0', 'AA 0123', null, undefined]) {
    assert.equal(parsePlate(plate), null, String(plate));
  }
});

test('suffix and prefix year letters give the issue period', () => {
  assert.equal(parsePlate('ABC 123D').issued.fromYear, 1966);
  const prefix = parsePlate('A123 BCD').issued;
  assert.deepEqual([prefix.fromYear, prefix.toYear], [1983, 1984]);
  assert.equal(parsePlate('ABC 123I').issued, null); // I was never a year letter
});

test('lookupPlate narrows authorities by year letter', () => {
  // AA: Hampshire to 1974, Salisbury 1974–1980, Bournemouth from 1980
  assert.deepEqual(names(lookupPlate('XAA 123K').authorities), ['Hampshire']);
  assert.deepEqual(names(lookupPlate('A123 XAA').authorities), ['Bournemouth']);
});

test('lookupPlate narrows dateless plates with the year option and otherwise lists all', () => {
  assert.equal(lookupPlate('AA 1').authorities.length, 3);
  assert.deepEqual(names(lookupPlate('AA 1', { year: 1925 }).authorities), ['Hampshire']);
  assert.deepEqual(names(lookupPlate('AA 1', { year: '1925' }).authorities), ['Hampshire']);
  assert.equal(lookupPlate('AA 1', null).authorities.length, 3);
  assert.equal(lookupPlate('AA 1', { year: '' }).authorities.length, 3);
});

test('a year letter takes precedence over the year option', () => {
  assert.deepEqual(names(lookupPlate('KAA 123P', { year: 1925 }).authorities), ['Salisbury']);
});

test('a never-issued year letter (Q plates and the like) matches no authority', () => {
  for (const plate of ['Q123 ABC', 'I123 ABC', 'ABC 123Z']) assert.deepEqual(lookupPlate(plate).authorities, [], plate);
});

test('earlier holders kept in source notes become dated authorities', () => {
  assert.deepEqual(names(lookupPlate('ED 1', { year: 1930 }).authorities), ['Warrington']);
  assert.deepEqual(names(lookupPlate('EJ 1', { year: 1950 }).authorities), ['Cardiganshire']);
  assert.deepEqual(names(lookupPlate('ATZ 1234', { year: 1990 }).authorities), ['Belfast']);
  assert.deepEqual(names(lookupPlate('ATZ 1234', { year: 2026 }).authorities), ['Downpatrick']);
  assert.deepEqual(getCode('XP').notes, ['later temporary plates for vehicles being exported to Europe']);
});

test('lookupPlate covers Northern Ireland codes and unknown or current marks', () => {
  const ni = lookupPlate('AZ 1234');
  assert.equal(ni.entry.region, 'NI');
  assert.deepEqual(names(ni.authorities), ['Belfast']);
  assert.equal(lookupPlate('QQ 1').entry, null);
  assert.deepEqual(lookupPlate('AB12 CDE').authorities, []);
  assert.equal(lookupPlate('not a plate'), null);
});

test('dataset: codes are unique, well formed and dated sensibly', () => {
  assert.equal(codes.length, 586);
  assert.equal(codes.filter((c) => c.region === 'NI').length, 34);
  assert.equal(new Set(codes.map((c) => c.code)).size, codes.length);
  for (const c of codes) {
    assert.match(c.code, /^[A-Z]{1,2}$/);
    assert.equal(c.region === 'NI', /[IZ]/.test(c.code), `${c.code} region`);
    assert.ok(c.authorities.length > 0, `${c.code} has an authority`);
    for (const a of c.authorities) {
      assert.match(a.name, /^[A-Z][\w '.()-]*$/, `${c.code} name ${a.name}`);
      if (a.from && a.to) assert.ok(a.from <= a.to, `${c.code} ${a.name} range`);
    }
  }
});

test('dataset: year letter series skip I, O, Q, U and Z', () => {
  assert.equal(yearLetters.suffix.length, 21);
  assert.equal(yearLetters.prefix.length, 21);
  for (const y of [...yearLetters.suffix, ...yearLetters.prefix]) assert.doesNotMatch(y.letter, /[IOQUZ]/);
});

test('build: parseItem splits names, dates and notes', () => {
  assert.deepEqual(parseItem('Bournemouth (for Salisbury) (from 1980)'), { name: 'Bournemouth', from: 1980, to: null, note: 'for Salisbury' });
  assert.deepEqual(parseItem('Yorkshire (North Riding) (1903–1974)'), { name: 'Yorkshire (North Riding)', from: 1903, to: 1974, note: null });
  assert.deepEqual(parseItem('Exeter (for Barnstaple) (1981)'), { name: 'Exeter', from: 1981, to: null, note: 'for Barnstaple' });
});

test('build: references and footnote templates are removed, ubl lists kept', () => {
  const text = 'A{{#tag:ref|Note with [[Link|link]] and {{cite web|url=x}}}}<ref name=a/><ref>x</ref> {{ubl|B|C}}';
  assert.equal(cleanWikitext(text), 'A {{ubl|B|C}}');
});

test('build: expandHistory turns notes on earlier holders into authorities', () => {
  assert.deepEqual(expandHistory({ name: 'Gloucester', from: null, to: null, note: 'Radnorshire until 1974, Hereford for Radnorshire until 1981' }), [
    { name: 'Radnorshire', from: null, to: 1974, note: null },
    { name: 'Hereford', from: 1974, to: 1981, note: 'for Radnorshire' },
    { name: 'Gloucester', from: 1981, to: null, note: null },
  ]);
  const plain = { name: 'Swansea', from: null, to: null, note: 'SCY used for Isles of Scilly' };
  assert.deepEqual(expandHistory(plain), [plain]);
});

test('build: items whose brackets span a list separator are joined', () => {
  assert.deepEqual(cellItems('{{ubl|Bangor (Merionethshire until 1974|Aberystwyth until 1981) }}'),
    ['Bangor (Merionethshire until 1974, Aberystwyth until 1981)']);
});

test('build: the saved sources rebuild the published data exactly', async () => {
  assert.deepEqual(await buildData(), { codes, yearLetters });
  assert.equal(await readFile(new URL('../data/codes.csv', import.meta.url), 'utf8'), toCsv(codes));
});
