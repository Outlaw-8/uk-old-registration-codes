// Downloads the Wikipedia tables the dataset is built from, at fixed revisions,
// into source/. Run `npm run fetch` only when moving to newer revisions; the
// build itself reads the saved copies and never touches the network.
import { writeFile } from 'node:fs/promises';

const SOURCES = [
  { file: 'gb-codes.wikitext', oldid: 1383646012, section: 22 },
  { file: 'year-letters.wikitext', oldid: 1383646012, section: 21 },
  { file: 'ni-codes.wikitext', oldid: 1383671713 },
];

for (const { file, oldid, section } of SOURCES) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'parse', oldid, prop: 'wikitext', format: 'json', formatversion: '2',
    ...(section ? { section } : {}),
  });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'uk-old-registration-codes (https://github.com/Outlaw-8/uk-old-registration-codes)' },
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const { parse, error } = await res.json();
  if (!parse) throw new Error(`${file}: ${error?.info ?? 'no wikitext returned'}`);
  await writeFile(new URL(`../source/${file}`, import.meta.url), parse.wikitext);
  console.log(`source/${file} <- revision ${oldid}`);
}
