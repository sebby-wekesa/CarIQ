/**
 * SMS text must stay in the GSM-7 alphabet: a single curly quote or emoji switches the whole
 * message to UCS-2, which cuts a segment from 160 to 70 characters and doubles or triples the
 * cost. Everything we send goes through toGsm7() first.
 */
const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXTENDED = "^{}\\[~]|€";
const BASIC_SET = new Set(BASIC);
const EXTENDED_SET = new Set(EXTENDED);

const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚′`´]/g, "'"],
  [/[“”„″«»]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/[     ]/g, " "],
  [/[​-‍﻿]/g, ""],
  [/\t/g, " "],
];

/** Swap typographic characters for plain ones, strip anything else outside GSM-7. */
export function toGsm7(text: string): string {
  let out = text.normalize("NFC");
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  out = [...out]
    .map((ch) => {
      if (BASIC_SET.has(ch) || EXTENDED_SET.has(ch)) return ch;
      const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return [...plain].every((c) => BASIC_SET.has(c)) ? plain : "";
    })
    .join("");
  return out.replace(/ {2,}/g, " ").trim();
}

/** Characters as the network counts them (extended characters take two). */
export function gsmLength(text: string): number {
  let n = 0;
  for (const ch of text) n += EXTENDED_SET.has(ch) ? 2 : 1;
  return n;
}

export function isGsm7(text: string): boolean {
  return [...text].every((ch) => BASIC_SET.has(ch) || EXTENDED_SET.has(ch));
}

/** How many billable parts a message takes. */
export function smsSegments(text: string): number {
  const gsm = isGsm7(text);
  const length = gsm ? gsmLength(text) : [...text].length;
  const single = gsm ? 160 : 70;
  const part = gsm ? 153 : 67;
  return length <= single ? 1 : Math.ceil(length / part);
}

/** Shorten to at most `max` characters on a word boundary, ending in "...". */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (gsmLength(clean) <= max) return clean;
  if (max <= 3) return "";
  let cut = "";
  for (const ch of clean) {
    if (gsmLength(cut + ch) > max - 3) break;
    cut += ch;
  }
  const space = cut.lastIndexOf(" ");
  if (space > max * 0.6) cut = cut.slice(0, space);
  return `${cut.replace(/[\s.,;:!?-]+$/, "")}...`;
}
