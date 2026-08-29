/**
 * Source files must be text.
 *
 * A stray control byte in a source file is nearly invisible: it compiles,
 * it runs, it passes review, and the editor renders it as nothing. The
 * cost shows up in version control, where git classifies the file as
 * binary and stops producing diffs and blame for it entirely — so the one
 * file carrying an unnoticed mistake becomes the one file nobody can
 * review line by line.
 *
 * This has happened three times in this repository, each time from a
 * generated escape sequence written into a string literal rather than a
 * regex. ESLint's `no-control-regex` catches the regex case and has no
 * opinion about the rest, which is exactly the half that got through.
 */
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readSourceBytes, sourceFilesUnder } from "./helpers/source-tree";

const ROOT = resolve(process.cwd());
const ROOTS = ["src", "tests", "scripts"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md)$/;

/*
 * Shared walker, so a file removed between the listing and the read is
 * skipped rather than throwing ENOENT. This guard used to fail with a
 * filesystem error on a different file each run whenever anything else
 * was writing to the tree — a failure unrelated to what it asserts, which
 * teaches people to re-run until green.
 */
const FILES = ROOTS.flatMap((r) => sourceFilesUnder(resolve(ROOT, r), EXTENSIONS));

describe("every source file is text", () => {
  it("scans a real tree", () => {
    // Guard the guard: a walk that silently found nothing would pass
    // every assertion below while checking exactly nothing.
    expect(FILES.length).toBeGreaterThan(200);
  });

  it("contains no control bytes outside tab, newline and carriage return", () => {
    /*
     * Tab (0x09), line feed (0x0a) and carriage return (0x0d) are the
     * only control characters with a legitimate place in source. Anything
     * else — a NUL from a `"\0"`, a backspace from a Python `"\b"` — is a
     * generation mistake wearing an invisible costume.
     */
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of FILES) {
      // Skipped when the file vanished since the walk. Counted below, so a
      // scan that read nothing cannot pass by reading nothing.
      // Raw bytes, never a decoded string: decoding would turn an invalid
      // sequence into U+FFFD and hide exactly what this looks for.
      const bytes = readSourceBytes(file);
      if (bytes === null) continue;
      scanned += 1;
      for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i]!;
        const control = byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d;
        if (!control && byte !== 0x7f) continue;
        offenders.push(
          `${relative(ROOT, file)} byte ${i}: 0x${byte.toString(16).padStart(2, "0")}`,
        );
        break;
      }
    }
    expect(offenders).toEqual([]);
    expect(scanned).toBeGreaterThan(200);
  });
});
