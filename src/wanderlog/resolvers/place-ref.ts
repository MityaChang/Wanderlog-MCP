/**
 * Pure place-reference resolver. Accepts a loose snapshot (unknown) and a
 * free-form reference string, returns a typed result without performing any
 * HTTP requests or mutations.
 */

export type PlaceRefMatch = {
  sectionIndex: number;
  blockIndex: number;
  block: unknown;
  name: string;
};

export type PlaceRefResult =
  | { kind: "unique"; match: PlaceRefMatch }
  | { kind: "ambiguous"; candidates: PlaceRefMatch[] }
  | { kind: "none" };

export type ParsedOrdinal = { position: number | "last"; rest: string };

const MAX_AMBIGUOUS_CANDIDATES = 10;

const HOTEL_KEYWORDS = new Set(["the hotel", "hotel", "my hotel"]);

const WORD_ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

/**
 * Detects an ordinal prefix on a normalized ref string. Handles:
 * - numeric suffixes: "1st X", "2nd X", "3rd X", "4th X", ...
 * - word ordinals: "first X", "second X", ..., "tenth X"
 * - "last X"
 *
 * Returns the 1-based position (or "last") and the rest of the ref with the
 * ordinal stripped, or null if no ordinal prefix is present.
 */
export function parseOrdinal(ref: string): ParsedOrdinal | null {
  if (ref.startsWith("last ")) {
    const rest = ref.slice(5).trim();
    if (rest) return { position: "last", rest };
  }

  const numMatch = /^(\d+)(?:st|nd|rd|th)\s+(.+)$/.exec(ref);
  if (numMatch) {
    const n = Number.parseInt(numMatch[1]!, 10);
    if (n >= 1) return { position: n, rest: numMatch[2]!.trim() };
  }

  const wordMatch = /^([a-z]+)\s+(.+)$/.exec(ref);
  if (wordMatch) {
    const n = WORD_ORDINALS[wordMatch[1]!];
    if (n !== undefined) return { position: n, rest: wordMatch[2]!.trim() };
  }

  return null;
}

/**
 * Resolves a free-form place reference against a trip snapshot.
 *
 * Strategy (short-circuits at the first stage that yields candidates):
 *   0. Ordinal prefix ("1st X", "last X", "second X") — strips ordinal,
 *      resolves the rest normally, then picks the N-th (or last) candidate.
 *      Combines with compound: "2nd shrine on day 1" is valid.
 *   1. Compound "<place> on <context>" — left side resolved via stages 2-4,
 *      then filtered to candidates in the matching day section.
 *   2. Hotel keywords ("the hotel", "hotel", "my hotel") — first place block
 *      that has a hotel metadata record (block.hotel).
 *   3. Exact (case-insensitive, whitespace/dash-collapsed) name match.
 *   4. Substring (case-insensitive) name match.
 */
export function resolvePlaceRef(
  snapshot: unknown,
  ref: string,
): PlaceRefResult {
  const normalized = normalize(ref);
  if (!normalized) return { kind: "none" };

  const sections = getItinerarySections(snapshot);
  if (sections.length === 0) return { kind: "none" };

  const ordinal = parseOrdinal(normalized);
  const body = ordinal ? ordinal.rest : normalized;

  const compound = splitCompound(body);
  const candidates =
    compound !== null &&
    resolveDayContextIndex(sections, compound.right) !== null
      ? filterByDayContext(
          sections,
          findCandidates(sections, compound.left),
          compound.right,
        )
      : findCandidates(sections, body);

  if (ordinal) {
    if (candidates.length === 0) return { kind: "none" };
    const index =
      ordinal.position === "last"
        ? candidates.length - 1
        : ordinal.position - 1;
    if (index < 0 || index >= candidates.length) return { kind: "none" };
    return { kind: "unique", match: candidates[index]! };
  }

  return finalize(candidates);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findCandidates(sections: unknown[], ref: string): PlaceRefMatch[] {
  if (HOTEL_KEYWORDS.has(ref)) {
    return findHotelMatches(sections);
  }

  const exact = findNameMatches(sections, ref, "exact");
  if (exact.length > 0) return exact;

  return findNameMatches(sections, ref, "substring");
}

function findHotelMatches(sections: unknown[]): PlaceRefMatch[] {
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    if (!isRecord(section) || !Array.isArray(section.blocks)) continue;
    for (let bi = 0; bi < section.blocks.length; bi++) {
      const block = section.blocks[bi];
      if (!isRecord(block) || block.type !== "place") continue;
      if (!isRecord(block.hotel)) continue;
      const name =
        isRecord(block.place) && typeof block.place.name === "string"
          ? block.place.name
          : "";
      return [{ sectionIndex: si, blockIndex: bi, block, name }];
    }
  }
  return [];
}

function findNameMatches(
  sections: unknown[],
  ref: string,
  mode: "exact" | "substring",
): PlaceRefMatch[] {
  const matches: PlaceRefMatch[] = [];
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    if (!isRecord(section) || !Array.isArray(section.blocks)) continue;
    for (let bi = 0; bi < section.blocks.length; bi++) {
      const block = section.blocks[bi];
      if (!isRecord(block) || block.type !== "place" || !isRecord(block.place))
        continue;
      const rawName =
        typeof block.place.name === "string" ? block.place.name : "";
      if (!rawName) continue;
      const normalized = normalize(rawName);
      const hit =
        mode === "exact" ? normalized === ref : normalized.includes(ref);
      if (hit) {
        matches.push({
          sectionIndex: si,
          blockIndex: bi,
          block,
          name: rawName,
        });
      }
    }
  }
  return matches;
}

function splitCompound(ref: string): { left: string; right: string } | null {
  const idx = ref.indexOf(" on ");
  if (idx < 0) return null;
  const left = ref.slice(0, idx).trim();
  const right = ref.slice(idx + 4).trim();
  if (!left || !right) return null;
  return { left, right };
}

function filterByDayContext(
  sections: unknown[],
  candidates: PlaceRefMatch[],
  context: string,
): PlaceRefMatch[] {
  if (candidates.length === 0) return candidates;
  const sectionIndex = resolveDayContextIndex(sections, context);
  if (sectionIndex === null) return [];
  return candidates.filter((c) => c.sectionIndex === sectionIndex);
}

/**
 * Resolves a day context string to a section index using local conventions:
 * - ISO date "YYYY-MM-DD" → exact date match
 * - "day N" (case-insensitive) → N-th dayPlan section (1-indexed)
 * - heading text (normalized) → normalized heading match
 *
 * The context string is already normalized (dashes collapsed to spaces), so ISO
 * dates of the form "2026-04-02" arrive as "2026 04 02" and must be
 * reconstructed before comparing against section.date.
 */
function resolveDayContextIndex(
  sections: unknown[],
  context: string,
): number | null {
  const normalized = context; // context is already normalized by the caller

  // Reconstruct ISO date from normalized "YYYY MM DD" or literal "YYYY-MM-DD"
  const spacedDate = /^(\d{4}) (\d{2}) (\d{2})$/.exec(normalized);
  const isoDate = spacedDate
    ? `${spacedDate[1]}-${spacedDate[2]}-${spacedDate[3]}`
    : /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? normalized
      : null;

  if (isoDate) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (
        isRecord(section) &&
        section.mode === "dayPlan" &&
        section.date === isoDate
      ) {
        return i;
      }
    }
    return null;
  }

  // "day N" ordinal
  const dayMatch = /^day (\d+)$/.exec(normalized);
  if (dayMatch) {
    const n = Number.parseInt(dayMatch[1]!, 10);
    let count = 0;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (
        isRecord(section) &&
        section.mode === "dayPlan" &&
        typeof section.date === "string" &&
        section.date.length > 0
      ) {
        count += 1;
        if (count === n) return i;
      }
    }
    return null;
  }

  // Heading match
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!isRecord(section) || section.mode !== "dayPlan") continue;
    const heading = typeof section.heading === "string" ? section.heading : "";
    if (normalize(heading) === normalized) return i;
  }

  return null;
}

function finalize(candidates: PlaceRefMatch[]): PlaceRefResult {
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "unique", match: candidates[0]! };
  return {
    kind: "ambiguous",
    candidates: candidates.slice(0, MAX_AMBIGUOUS_CANDIDATES),
  };
}

function getItinerarySections(snapshot: unknown): unknown[] {
  if (!isRecord(snapshot) || !isRecord(snapshot.itinerary)) return [];
  return Array.isArray(snapshot.itinerary.sections)
    ? snapshot.itinerary.sections
    : [];
}

function normalize(s: string): string {
  return s
    .replace(/[\s\-–—]+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
