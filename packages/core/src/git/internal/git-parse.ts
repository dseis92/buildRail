/**
 * Byte-first parsing helpers shared across BR3's Git-output consumers
 * (§13). Every BR3 code path that could contain a repository path or
 * other repository-controlled text decodes it via these helpers rather
 * than a lossy default `Buffer#toString("utf-8")`.
 */

export class MalformedOutputError extends Error {}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** Strict-decodes one byte range as UTF-8 (§13 Category 2). Throws MalformedOutputError on invalid UTF-8. */
export function strictDecode(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new MalformedOutputError("Repository-controlled output was not valid UTF-8.");
  }
}

/** Splits a NUL-delimited buffer into field byte ranges, without a trailing empty field for a trailing NUL. */
export function splitNulFields(buf: Buffer): Buffer[] {
  const fields: Buffer[] = [];
  let start = 0;
  for (;;) {
    const idx = buf.indexOf(0x00, start);
    if (idx === -1) {
      if (start < buf.length) {
        fields.push(buf.subarray(start));
      }
      break;
    }
    fields.push(buf.subarray(start, idx));
    start = idx + 1;
  }
  return fields;
}

/** Splits a NUL-delimited buffer into raw records (each still needing its own internal parsing), by NUL only where records are single-field. */
export function decodeNulFieldsStrict(buf: Buffer): string[] {
  if (buf.length && buf.at(-1) !== 0) throw new MalformedOutputError("Missing final NUL.");
  return splitNulFields(buf).map((f) => strictDecode(f));
}

/**
 * Removes exactly one trailing LF (0x0a) from a decoded string if present,
 * per Git's line-oriented output convention (§13 Category 1/2). Never
 * removes leading whitespace, never removes trailing whitespace other than
 * the single LF record terminator. Preserves every byte belonging to the
 * actual value — including trailing spaces, tabs, or embedded newlines.
 */
export function removeTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}
