// Test-only readers for rendered PDFs. Byte snapshots would be brittle —
// embedded fonts and a creation timestamp change on every run — so tests assert
// the text layer and the page count instead.

import { inflateSync } from "node:zlib";

// latin1 maps every byte to exactly one char, so string offsets are byte
// offsets. Anything multi-byte would desync the stream slicing below. (Bun's
// TextDecoder types only admit utf-8/utf-16/windows-1252, hence Buffer.)
const latin1 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("latin1");

/** A text-showing operand: either a `[...] TJ` array or a `(...) Tj` string. */
const TEXT_OP = /(\[[^\]]*\]|\((?:\\.|[^()\\])*\))\s*T[Jj]/g;

/** The pieces inside one operand. react-pdf emits hex; literals are for safety. */
const STRING_PIECE = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^()\\])*)\)/g;

/**
 * The `stream` keyword that opens a body — but not the one ending `endstream`,
 * which would otherwise match and make the scanner skip the next real stream.
 */
const STREAM_OPENER = /(?<![A-Za-z])stream\r?\n/g;

/**
 * The byte length the stream's own dictionary declares. Preferred over hunting
 * for `endstream`, since a compressed body can contain those bytes by chance.
 */
function declaredLength(raw: string, openerIndex: number): number | null {
  const dict = raw.slice(Math.max(0, openerIndex - 300), openerIndex);
  const lengths = [...dict.matchAll(/\/Length (\d+)/g)];
  const last = lengths.at(-1);
  return last === undefined ? null : Number(last[1]);
}

/**
 * Every stream in the file, inflated where it is flate-compressed. Streams that
 * are neither flate nor text (embedded fonts, images) inflate-fail and are kept
 * raw; they simply contain no text operators.
 */
function streams(bytes: Uint8Array): string[] {
  const raw = latin1(bytes);
  const found: string[] = [];

  STREAM_OPENER.lastIndex = 0;
  let match = STREAM_OPENER.exec(raw);
  while (match !== null) {
    const start = match.index + match[0].length;
    const declared = declaredLength(raw, match.index);
    const end =
      declared === null ? raw.indexOf("endstream", start) : start + declared;
    if (end === -1 || end <= start) {
      break;
    }

    const body = bytes.subarray(start, end);
    try {
      found.push(latin1(inflateSync(body)));
    } catch {
      found.push(latin1(body));
    }

    STREAM_OPENER.lastIndex = end;
    match = STREAM_OPENER.exec(raw);
  }

  return found;
}

function decodeHex(hex: string): string {
  const digits = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < digits.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(digits.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * The document's visible text, recovered from its content streams — one line per
 * text-showing operator, so a per-line assertion means something.
 *
 * react-pdf writes hex-string `TJ` arrays with kerning offsets between the
 * chunks, so the pieces of one operator are concatenated to rebuild the run.
 * Good enough to assert that a label and a formatted figure reached the page;
 * not a general PDF parser. Text comes back byte-for-byte in the font's
 * encoding, so assert on ASCII — an em dash arrives as its WinAnsi byte, not as
 * "—".
 */
export function extractText(bytes: Uint8Array): string {
  const runs: string[] = [];

  for (const stream of streams(bytes)) {
    for (const [, operand] of stream.matchAll(TEXT_OP)) {
      let run = "";
      for (const [, hex, literal] of operand.matchAll(STRING_PIECE)) {
        if (hex !== undefined) {
          run += decodeHex(hex);
        } else {
          run += literal.replace(/\\([()\\])/g, "$1");
        }
      }
      runs.push(run);
    }
  }

  return runs.join("\n");
}

export function pageCount(bytes: Uint8Array): number {
  const raw = latin1(bytes);
  return (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
