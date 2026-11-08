export interface Authority {
  /** Council or local office, e.g. "Coventry" or "Yorkshire (North Riding)". */
  name: string;
  /** First year it issued the code, or null when the source gives no date. */
  from: number | null;
  /** Last year it issued the code; null when it held the code until the pre-2001 system ended, or when the source gives no date. */
  to: number | null;
  /** Extra detail from the source, e.g. "for Salisbury". */
  note: string | null;
}

export interface AreaCode {
  /** One or two letters, e.g. "A" or "HP". */
  code: string;
  /** "GB" for Great Britain, "NI" for Northern Ireland. */
  region: 'GB' | 'NI';
  /** Issuing authorities, oldest first. */
  readonly authorities: readonly Authority[];
  /** Notes about the code itself, e.g. "unused after 1974". */
  readonly notes: readonly string[];
}

export interface YearLetter {
  letter: string;
  fromYear: number;
  toYear: number;
  /** Dates of issue as the source gives them, e.g. "1 August 1983 – 31 July 1984". */
  label: string;
}

export type PlateFormat = 'current' | 'prefix' | 'suffix' | 'dateless' | 'three-letter' | 'reversed';

export interface ParsedPlate {
  /** The mark in capitals with spaces and hyphens removed. */
  mark: string;
  format: PlateFormat;
  /** Area code, or null for current (2001 onwards) marks, which this package does not cover. */
  areaCode: string | null;
  /** Year letter of a suffix or prefix mark. */
  yearLetter?: string;
  /** Issue period of that year letter, or null for a letter that was never issued as a year letter. */
  issued?: YearLetter | null;
}

export interface PlateLookup extends ParsedPlate {
  entry: AreaCode | null;
  /** Authorities that could have issued the mark, narrowed by year letter or the `year` option. */
  authorities: readonly Authority[];
}

export const codes: readonly AreaCode[];
export const yearLetters: { readonly suffix: readonly YearLetter[]; readonly prefix: readonly YearLetter[] };
export function getCode(code: string): AreaCode | undefined;
export function parsePlate(plate: string): ParsedPlate | null;
/** `year` may be a number or a numeric string; a year letter on the plate takes precedence. */
export function lookupPlate(plate: string, options?: { year?: number | string } | null): PlateLookup | null;
