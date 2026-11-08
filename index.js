import codesData from './data/codes.json' with { type: 'json' };
import yearLettersData from './data/year-letters.json' with { type: 'json' };

/** Every pre-2001 area code with the authorities that issued it. */
export const codes = codesData;

/** Year letters of the suffix (1963–1983) and prefix (1983–2001) series. */
export const yearLetters = yearLettersData;

const byCode = new Map(codes.map((entry) => [entry.code, entry]));

/** Looks up one area code, e.g. "HP" or "a". Returns undefined when the code is unknown. */
export function getCode(code) {
  return byCode.get(String(code).trim().toUpperCase());
}

// No mark matches two of these patterns, so their order does not matter.
// Serial numbers never start with 0.
const FORMATS = [
  // 2001 onwards, e.g. "AB12 CDE": a different code system, not covered.
  { format: 'current', re: /^[A-Z]{2}\d{2}[A-Z]{3}$/ },
  // 1983–2001 prefix, e.g. "A123 BCD": year letter first, area code last.
  { format: 'prefix', re: /^([A-Z])[1-9]\d{0,2}[A-Z]([A-Z]{2})$/, year: 1, area: 2 },
  // 1963–1983 suffix, e.g. "ABC 123D": area code in letters two and three, year letter last.
  { format: 'suffix', re: /^[A-Z]([A-Z]{2})[1-9]\d{0,2}([A-Z])$/, area: 1, year: 2 },
  // 1903 onwards, e.g. "A 1", "ND 7102": the letters are the area code.
  { format: 'dateless', re: /^([A-Z]{1,2})[1-9]\d{0,3}$/, area: 1 },
  // 1932 onwards (and Northern Ireland from 1966), e.g. "DHP 551": a serial letter, then the area code.
  { format: 'three-letter', re: /^[A-Z]([A-Z]{2})[1-9]\d{0,3}$/, area: 1 },
  // 1953 onwards, e.g. "1234 AB" or "123 ABC": numbers first; with three letters the
  // first is a serial letter and the last two are the area code.
  { format: 'reversed', re: /^[1-9]\d{0,3}(?:[A-Z](?=[A-Z]{2}$))?([A-Z]{1,2})$/, area: 1 },
];

/**
 * Works out the format, area code and (where the plate carries one) year letter of a
 * registration mark. Spaces, hyphens and case are ignored. Returns null for anything
 * that is not a UK registration format.
 */
export function parsePlate(plate) {
  const mark = String(plate).toUpperCase().replace(/[\s-]/g, '');
  for (const { format, re, area, year } of FORMATS) {
    const m = mark.match(re);
    if (!m) continue;
    const result = { mark, format, areaCode: area ? m[area] : null };
    if (year) {
      result.yearLetter = m[year];
      result.issued = yearLetters[format].find((y) => y.letter === m[year]) ?? null;
    }
    return result;
  }
  return null;
}

/**
 * Parses a registration mark and returns its area code entry and the authorities that
 * could have issued it. A suffix or prefix year letter narrows the list (and takes
 * precedence over `year`); for older plates pass `{ year }`, such as the year of first
 * registration. A year letter that was never issued (I, O, Q, U, Z) matches no authority.
 * A three-letter mark that its code's notes name (MAN, GPO, SCY) is not read by its area
 * code: `special` is that note, and no authority is listed.
 */
export function lookupPlate(plate, options) {
  const parsed = parsePlate(plate);
  if (!parsed) return null;
  const entry = getCode(parsed.areaCode ?? '') ?? null;
  const letters = parsed.mark.match(/[A-Z]{3}/)?.[0];
  const special = (letters && entry?.notes.find((n) => n.startsWith(`${letters} `))) || null;
  const year = Number(options?.year);
  const range = parsed.issued
    ? [parsed.issued.fromYear, parsed.issued.toYear]
    : Number.isInteger(year) && year > 0 ? [year, year] : null;
  const matches = (a) => (a.from ?? -Infinity) <= range[1] && (a.to ?? Infinity) >= range[0];
  const authorities = !entry || special || parsed.issued === null ? [] : range ? entry.authorities.filter(matches) : entry.authorities;
  return { ...parsed, entry, special, authorities };
}
