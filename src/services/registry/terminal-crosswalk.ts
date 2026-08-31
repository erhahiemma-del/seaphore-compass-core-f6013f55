/**
 * Joining what a terminal *is* to what is happening at it.
 *
 * Two sources name the same quay differently. The NPA shipping schedule
 * writes the code it prefixes to a berth — `Terminal B`, `APMT`, `WACT
 * FOT`. The facility registry writes a full name with the operator in
 * parentheses — `Terminal B (TICT)`, `APM Terminals Apapa`, `Federal
 * Ocean Terminal B (WACT)`. Neither is wrong; they are different
 * registers of the same vocabulary.
 *
 * Joining them is what turns "ABTL, 3 of 5 berths occupied" into a
 * terminal with an operator, a concession, a draft and a position.
 *
 * ## Every match states how it was made
 *
 * A join between two registers is a claim, and the claims here are not
 * equally strong. `Terminal A` matching `Terminal A` inside one port is
 * near-certain; `APMT` matching `APM Terminals Apapa` is an abbreviation
 * a human recognises and a string comparison does not. So each match
 * carries the rule that produced it, and anything no rule reaches is
 * reported unmatched rather than forced.
 *
 * ## What it deliberately does not do
 *
 * No fuzzy distance, no token overlap, no "closest match wins". Those
 * would raise the match count and lower the meaning of a match: an
 * officer reading a terminal's operator needs to know it came from a
 * register, not from an edit-distance threshold. Unmatched is a fine
 * outcome — the NPA terminal still works, with less attached to it.
 */
import { canonicalPortId } from "@/services/geospatial/nigerian-ports";

import type { FacilityRegistry, RegistryTerminal } from "./registry-ingest";

/** How a registry terminal came to be attached to an NPA code. */
export type MatchMethod =
  /**
   * The names are identical once normalised, within the same port.
   *
   * `New Terminal A` at Calabar in both registers. The strongest join
   * available without an identifier shared between the two sources.
   */
  | "EXACT_NAME"
  /**
   * The registry name is the NPA code plus a parenthetical operator.
   *
   * `Terminal B (TICT)` for NPA's `Terminal B`. This is the registry's
   * own convention — it appends the operator to disambiguate — so
   * stripping it recovers the code the schedule uses.
   */
  | "PARENTHETICAL"
  /**
   * The NPA code appears as a parenthetical inside the registry name.
   *
   * NPA's `WACT FOT` against `Federal Ocean Terminal B (WACT)`. The
   * operator abbreviation is the shared token, and the registry put it
   * in brackets precisely because it is the recognised short form.
   */
  | "OPERATOR_ABBREVIATION";

/** A terminal known to both registers. */
export interface TerminalMatch {
  /** The code exactly as NPA writes it. */
  readonly npaCode: string;
  /** Canonical LOCODE of the port both agree on. */
  readonly portLocode: string;
  readonly registry: RegistryTerminal;
  readonly method: MatchMethod;
  /** Officer-facing sentence explaining the join. Always set. */
  readonly note: string;
}

export interface CrosswalkResult {
  readonly matches: readonly TerminalMatch[];
  /** NPA codes no rule reached. Not an error — just unjoined. */
  readonly unmatchedNpaCodes: readonly string[];
  /** Registry terminals NPA has no code for in this dataset. */
  readonly unmatchedRegistryIds: readonly string[];
}

/**
 * Reduce a name to what the two registers actually share.
 *
 * Case, punctuation and spacing only. Nothing is stemmed or abbreviated
 * here — those are the differences that carry meaning between `Terminal A`
 * and `Terminal A1`.
 */
export function normaliseTerminalName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** The part of a registry name before its trailing parenthetical. */
export function stripParenthetical(name: string): string {
  const open = name.indexOf("(");
  return open > 0 ? name.slice(0, open).trim() : name.trim();
}

/** Every parenthetical in a registry name, e.g. `WACT` from `… (WACT)`. */
export function parentheticals(name: string): readonly string[] {
  return [...name.matchAll(/\(([^)]+)\)/g)].map((match) => match[1].trim()).filter(Boolean);
}

/**
 * Which canonical port a registry terminal belongs to.
 *
 * Resolved through the registry's parent port, whose UN/LOCODE goes
 * through `canonicalPortId` — the registry writes `NGLOS` for Apapa where
 * Seaphore's register says `NGAPAPA`, and the alias table is what keeps
 * those the same place.
 */
export function registryPortLocode(
  terminal: RegistryTerminal,
  registry: FacilityRegistry,
): string | null {
  const port = registry.ports.find((entry) => entry.id === terminal.portId);
  return port?.unlocode ? canonicalPortId(port.unlocode) : null;
}

/**
 * Attach registry terminals to the NPA codes that name them.
 *
 * `npaCodes` is a list of (code, port) pairs as the operational dataset
 * holds them — the same terminal code can exist at two ports, and the
 * port is part of the identity.
 */
export function crosswalkTerminals(
  npaCodes: readonly { readonly code: string; readonly portLocode: string | null }[],
  registry: FacilityRegistry | null,
): CrosswalkResult {
  if (!registry) {
    return {
      matches: [],
      unmatchedNpaCodes: npaCodes.map((entry) => entry.code),
      unmatchedRegistryIds: [],
    };
  }

  const matches: TerminalMatch[] = [];
  const unmatchedNpaCodes: string[] = [];
  const claimed = new Set<string>();

  /* Indexed by canonical port, because a code is only unique within one. */
  const byPort = new Map<string, RegistryTerminal[]>();
  for (const terminal of registry.terminals) {
    const locode = registryPortLocode(terminal, registry);
    if (!locode) continue;
    const list = byPort.get(locode);
    if (list) list.push(terminal);
    else byPort.set(locode, [terminal]);
  }

  for (const entry of npaCodes) {
    const locode = entry.portLocode ? canonicalPortId(entry.portLocode) : null;
    const candidates = locode ? (byPort.get(locode) ?? []) : [];
    const code = normaliseTerminalName(entry.code);

    let found: { terminal: RegistryTerminal; method: MatchMethod } | null = null;

    for (const terminal of candidates) {
      if (normaliseTerminalName(terminal.name) === code) {
        found = { terminal, method: "EXACT_NAME" };
        break;
      }
    }

    if (!found) {
      for (const terminal of candidates) {
        if (normaliseTerminalName(stripParenthetical(terminal.name)) === code) {
          found = { terminal, method: "PARENTHETICAL" };
          break;
        }
      }
    }

    if (!found) {
      for (const terminal of candidates) {
        const shortForms = parentheticals(terminal.name).map(normaliseTerminalName);
        /*
         * The NPA code often carries a facility suffix the registry does
         * not — `WACT FOT` against a parenthetical of `WACT`. Matching on
         * the leading token keeps that join while still requiring the
         * abbreviation itself to be stated by the registry.
         */
        const leading = code.split(" ")[0];
        if (shortForms.includes(code) || shortForms.includes(leading)) {
          found = { terminal, method: "OPERATOR_ABBREVIATION" };
          break;
        }
      }
    }

    if (!found || !locode) {
      unmatchedNpaCodes.push(entry.code);
      continue;
    }

    claimed.add(found.terminal.id);
    matches.push({
      npaCode: entry.code,
      portLocode: locode,
      registry: found.terminal,
      method: found.method,
      note: noteFor(entry.code, found.terminal, found.method),
    });
  }

  return {
    matches,
    unmatchedNpaCodes,
    unmatchedRegistryIds: registry.terminals
      .filter((terminal) => !claimed.has(terminal.id))
      .map((terminal) => terminal.id),
  };
}

function noteFor(code: string, terminal: RegistryTerminal, method: MatchMethod): string {
  switch (method) {
    case "EXACT_NAME":
      return `NPA writes "${code}"; the facility registry records the same name at the same port.`;
    case "PARENTHETICAL":
      return `NPA writes "${code}"; the registry records "${terminal.name}" — the same name with its operator appended.`;
    case "OPERATOR_ABBREVIATION":
      return `NPA writes "${code}"; the registry records "${terminal.name}", naming that abbreviation as the operator. Matched on the abbreviation the registry itself states.`;
  }
}
