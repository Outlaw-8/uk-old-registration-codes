# uk-old-registration-codes

The area codes on British number plates from 1903 to 2001, with the council or local office that issued each one, and a parser that reads an old plate and tells you where it was registered. The year letter on a suffix or prefix plate also tells you when.

Before 2001 the last two letters of a plate showed the area that registered the car: `HP` was Coventry, `YL` London, `AA` Hampshire. Councils issued the codes from 1903 until local vehicle licensing offices took over in 1974, and some codes moved between authorities, so the data lists every authority with the years it held the code.

The dataset has 586 codes: 552 for Great Britain and 34 for Northern Ireland. It comes as JSON, as CSV, and as a small JavaScript package with TypeScript types and no dependencies.

## Install

```sh
npm install uk-old-registration-codes
```

Node 20.10 or later, or a bundler that supports import attributes (`import … with { type: 'json' }`). Node versions before 22.12 print a warning that JSON modules are experimental; it does no harm.

## Use

```js
import { lookupPlate, getCode, parsePlate } from 'uk-old-registration-codes';

lookupPlate('DHP 551').authorities;
// [{ name: 'Coventry', from: 1919, to: null, note: null }]

// A suffix plate's year letter narrows the list to the authority of the day.
const plate = lookupPlate('KAA 123P');
plate.issued.label;  // '1 August 1975 – 31 July 1976'
plate.authorities;   // [{ name: 'Salisbury', from: 1974, to: 1980, note: null }]

// Plates before 1963 carry no year; pass the year of first registration if you know it.
lookupPlate('YL 4773', { year: 1925 }).authorities;
// [{ name: 'London', from: 1925, to: 1974, note: null }]

getCode('XS');
// { code: 'XS', region: 'GB', authorities: [{ name: 'Paisley', from: 1903, to: 1974, note: null }],
//   notes: ['unused after 1974'] }
```

### Functions

| Function | Returns |
|---|---|
| `getCode(code)` | The entry for one area code, or `undefined` |
| `parsePlate(plate)` | `{ mark, format, areaCode, yearLetter?, issued? }`, or `null` if the text is not a UK registration mark |
| `lookupPlate(plate, { year }?)` | What `parsePlate` returns, plus `entry` (the area code) and `authorities` (those that could have issued it) |

`year` can be a number or a numeric string. A year letter on the plate takes precedence over it. A letter that was never issued as a year letter (I, O, Q, U, Z) gives an empty `authorities` list.

`codes` (an array of area codes) and `yearLetters` (`{ suffix, prefix }`) are also exported.

### Plate formats

| `format` | Example | Years | Area code |
|---|---|---|---|
| `dateless` | `A 1`, `ND 7102` | 1903 on | The letters |
| `three-letter` | `DHP 551` | 1932 on; Northern Ireland from 1966 | Last two letters |
| `reversed` | `1234 AB`, `123 ABC` | 1953 on | The letters, or the last two of three |
| `suffix` | `ABC 123D` | 1963–1983 | Second and third letters |
| `prefix` | `A123 BCD` | 1983–2001 | Last two letters |
| `current` | `AB12 CDE` | 2001 on | Not covered; `areaCode` is `null` |

Spaces, hyphens and case are ignored.

## Data files

`data/codes.json`, `data/codes.csv` and `data/year-letters.json` can be used without the code, and the package exports them as `uk-old-registration-codes/codes.json`, `/codes.csv` and `/year-letters.json`.

```json
{
 "code": "AA",
 "region": "GB",
 "authorities": [
  { "name": "Hampshire", "from": 1903, "to": 1974, "note": null },
  { "name": "Salisbury", "from": 1974, "to": 1980, "note": null },
  { "name": "Bournemouth", "from": 1980, "to": null, "note": "for Salisbury" }
 ],
 "notes": []
}
```

`from` and `to` are years. `null` means the source gives no date, or for `to`, that the authority held the code until the system ended. A note such as "for Salisbury" means the office issued the code on behalf of another one. The CSV has one row per authority, and one row per code note with the authority columns empty.

## Limits

- Northern Ireland codes have no dates here apart from the 2025 moves away from Belfast. Their place names follow the source table, which writes most counties without "County".
- Some earlier holders have no start year in the source (Warrington for ED, for example), so they have `from: null`.
- Where an authority handed over a code during a year, both authorities match that year.
- Special three-letter marks are read by their last two letters like any other mark, so `lookupPlate` gives the wrong place for them: MAN (Isle of Man), SCY (Isles of Scilly), GPO (Post Office), QNI and LTZ.
- The parser checks the shape of a mark, not whether the serial number was ever issued.
- Codes of the Republic of Ireland (those starting with Z, and some with I) are not included.

## Sources and licence

The data is built from two Wikipedia articles, saved in `source/` at fixed revisions:

- [Vehicle registration plates of the United Kingdom](https://en.wikipedia.org/w/index.php?title=Vehicle_registration_plates_of_the_United_Kingdom&oldid=1383646012), revision 1383646012: the sections "Pre-2001 codes" and "Year identifiers".
- [Vehicle registration plates of Northern Ireland](https://en.wikipedia.org/w/index.php?title=Vehicle_registration_plates_of_Northern_Ireland&oldid=1383671713), revision 1383671713: the table of codes.

`npm run fetch` downloads those revisions again, `npm run build` turns them into `data/`, and `npm test` checks that the build reproduces the published files.

The data in `data/` is adapted from those articles by Wikipedia contributors, and `source/` holds the article text itself. Both are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (see `DATA-LICENSE`). The code is MIT (see `LICENSE`). A bundle that includes the package includes the CC BY-SA data too, so keep `DATA-LICENSE` with it.

## About

Maintained by [OUTLAW 8](https://outlaw8.com), a directory of classic car dealers, restorers, clubs and garages in 53 countries. Corrections are welcome as issues or pull requests; a correction to the data should also go to the Wikipedia article it came from.
