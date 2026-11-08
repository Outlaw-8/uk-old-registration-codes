// Builds data/*.json and data/codes.csv from the Wikipedia wikitext saved in source/.
// The parsing functions are exported so the tests can check them on small samples.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Removes every {{template}} whose name passes `drop`, matching nested braces. */
function removeTemplates(text, drop) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{{', i);
    if (start === -1) break;
    let depth = 0;
    let end = start;
    for (; end < text.length; end++) {
      if (text.startsWith('{{', end)) { depth++; end++; }
      else if (text.startsWith('}}', end)) { depth--; end++; if (depth === 0) break; }
    }
    const name = text.slice(start + 2).split(/[|}]/, 1)[0].trim().toLowerCase();
    out += text.slice(i, start) + (drop(name) ? '' : text.slice(start, end + 1));
    i = end + 1;
  }
  return out + text.slice(i);
}

/** Strips references, footnote templates, links and markup, keeping {{ubl}} lists. */
export function cleanWikitext(text) {
  const noRefs = text
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  return removeTemplates(noRefs, (name) => name !== 'ubl')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/&nbsp;/g, ' ');
}

/** Turns one list item, e.g. "Bournemouth (for Salisbury) (from 1980)", into its parts. */
export function parseItem(item) {
  let from = null;
  let to = null;
  const notes = [];
  const name = item.replace(/\(([^()]*)\)/g, (_, inner) => {
    const t = inner.trim();
    let m;
    if ((m = t.match(/^(\d{4})\s*[–-]\s*(\d{4})$/))) { from = +m[1]; to = +m[2]; }
    // "(from 1974)", "(from 2025 reassigned from Belfast)" and a bare "(1981)" all give a start year.
    else if ((m = t.match(/^(?:from )?(\d{4})\b\s*(.*)$/i))) { from = +m[1]; if (m[2]) notes.push(m[2]); }
    else if ((m = t.match(/^until (\d{4})$/i))) { to = +m[1]; }
    // A capitalised place qualifier such as "North Riding" or "IoW" is part of the name.
    else if (/^[A-Z][\w']*(?: [A-Z][\w']*)*$/.test(t)) return `(${t})`;
    else notes.push(t);
    return '';
  }).replace(/\s+/g, ' ').trim();
  return { name, from, to, note: notes.join('; ') || null };
}

/**
 * Splits a table cell into list items: the arguments of {{ubl|...}} or the cell itself.
 * A few source rows open a bracket in one item and close it in the next
 * ("Haverfordwest (Cardiganshire until 1974,|Aberystwyth until 1981)"), so such
 * items are joined back into one.
 */
export function cellItems(cell) {
  const m = cell.match(/^\{\{\s*ubl\s*\|([\s\S]*)\}\}$/i);
  const parts = (m ? m[1].split('|') : [cell]).map((s) => s.trim()).filter(Boolean);
  const open = (s) => (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length;
  const items = [];
  for (const part of parts) {
    if (items.length && open(items.at(-1))) items[items.length - 1] = `${items.at(-1).replace(/,$/, '')}, ${part}`;
    else items.push(part);
  }
  return items;
}

/**
 * Some rows keep earlier holders in a note: "Liverpool (Warrington until 1981)",
 * "Gloucester (Radnorshire until 1974, Hereford for Radnorshire until 1981)" or
 * "Downpatrick (from 2025 reassigned from Belfast)". Those become dated authorities
 * listed before the current one.
 */
export function expandHistory(item) {
  const steps = (item.note ?? '').split(', ').map((p) => p.match(/^(.+?)(?: (for .+))? until (\d{4})$/));
  if (item.note && steps.every(Boolean)) {
    let from = null;
    const earlier = steps.map(([, name, note, to]) => {
      const a = { name, from, to: +to, note: note ?? null };
      from = +to;
      return a;
    });
    return [...earlier, { ...item, from, note: null }];
  }
  const moved = item.note?.match(/^reassigned from (.+)$/i);
  if (moved && item.from) return [{ name: moved[1], from: null, to: item.from, note: null }, { ...item, note: null }];
  return [item];
}

/** Reads the code/description pairs out of a wikitable whose rows use "||" separators. */
function parseCodeTable(wikitext, region) {
  const entries = [];
  for (const line of cleanWikitext(wikitext).split('\n')) {
    if (!line.startsWith('|') || /^\|[-}+]/.test(line)) continue;
    const cells = line.slice(1).split('||').map((c) => c.trim());
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const code = cells[i];
      if (!/^[A-Z]{1,2}$/.test(code)) continue;
      const authorities = [];
      const notes = [];
      for (const raw of cellItems(cells[i + 1])) {
        const item = parseItem(raw);
        // "unused after 1974", "later temporary plates ..." and bare "(...)" items are notes.
        if (!item.name || /^[a-z]/.test(item.name)) notes.push(raw.replace(/^\((.*)\)$/, '$1'));
        else authorities.push(...expandHistory(item));
      }
      entries.push({ code, region, authorities, notes });
    }
  }
  return entries;
}

/** Reads the suffix and prefix year-letter tables. */
function parseYearLetters(wikitext) {
  const text = cleanWikitext(wikitext);
  const result = {};
  for (const [key, caption] of [['suffix', 'Suffix'], ['prefix', 'Prefix']]) {
    const start = text.indexOf(`|+ ${caption}`);
    if (start === -1) throw new Error(`year-letters source: no "${caption}" table`);
    const block = text.slice(start).split('|}')[0];
    const rows = [...block.matchAll(/^!\s*scope="row"\s*\|\s*([A-Z])\s*\n\|\s*(.+)$/gm)];
    result[key] = rows.map(([, letter, label]) => {
      const years = label.match(/\b\d{4}\b/g).map(Number);
      return { letter, fromYear: years[0], toYear: years.at(-1), label: label.trim() };
    });
  }
  return result;
}

/** The first table on the Northern Ireland page that lists codes. */
function niCodeTable(wikitext) {
  const start = wikitext.indexOf('!Code !!County or City');
  const end = wikitext.indexOf('|}', start);
  if (start === -1 || end === -1) throw new Error('NI source: no code table');
  return wikitext.slice(start, end);
}

export function toCsv(codes) {
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [['code', 'region', 'authority', 'from', 'to', 'note']];
  for (const c of codes) {
    for (const a of c.authorities) rows.push([c.code, c.region, a.name, a.from, a.to, a.note]);
    for (const n of c.notes) rows.push([c.code, c.region, '', '', '', n]);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

/**
 * Applies source/corrections.json: values other sources show to be wrong in the Wikipedia text. Each correction
 * names the value it replaces, so the build stops if the source text changes under it.
 */
export function applyCorrections(codes, corrections) {
  for (const { code, authority, field, was, is } of corrections) {
    const entry = codes.find((c) => c.code === code);
    const target = authority ? entry?.authorities.find((a) => a.name === authority) : entry;
    if (!target || JSON.stringify(target[field]) !== JSON.stringify(was)) {
      throw new Error(`correction ${code} ${authority ?? ''} ${field}: the source no longer gives ${JSON.stringify(was)}`);
    }
    target[field] = is;
  }
  return codes;
}

/** Parses the saved sources into the published data. */
export async function buildData() {
  const read = (f) => readFile(new URL(`../source/${f}`, import.meta.url), 'utf8');
  const codes = applyCorrections([
    ...parseCodeTable(await read('gb-codes.wikitext'), 'GB'),
    ...parseCodeTable(niCodeTable(await read('ni-codes.wikitext')), 'NI'),
  ], JSON.parse(await read('corrections.json'))).sort((a, b) => (a.code < b.code ? -1 : 1)); // plain code-unit order, the same in every locale
  return { codes, yearLetters: parseYearLetters(await read('year-letters.wikitext')) };
}

async function main() {
  const write = (f, s) => writeFile(new URL(`../data/${f}`, import.meta.url), s);
  const { codes, yearLetters } = await buildData();
  await write('codes.json', JSON.stringify(codes) + '\n');
  await write('codes.csv', toCsv(codes));
  await write('year-letters.json', JSON.stringify(yearLetters) + '\n');
  console.log(`${codes.length} codes written`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
