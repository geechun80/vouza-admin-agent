// =============================================================================
// IMAP search translation for read_emails
//
// The agent writes Gmail-style queries ("from:bank is:unread newer_than:7d").
// Over an App Password the read path is IMAP, which used to understand only
// is:unread / is:read — "find the email from my bank" returned the last N
// emails unfiltered.
//
//   • Gmail servers (X-GM-EXT-1): pass the query through as X-GM-RAW, so the
//     agent gets exactly Gmail's own search semantics.
//   • Other servers: translate the common operators to standard IMAP SEARCH;
//     free words become a TEXT (headers + body) match. Unknown operators
//     (has:, in:, label:, category:) are ignored rather than mis-translated.
// =============================================================================

export interface ImapCriteria {
  all?:     boolean;
  seen?:    boolean;
  flagged?: boolean;
  from?:    string;
  to?:      string;
  cc?:      string;
  subject?: string;
  text?:    string;
  since?:   Date;
  before?:  Date;
  gmraw?:   string;
}

const DAY_MS = 86_400_000;
const UNIT_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

function unquote(v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

/** "2026/09/01" or "2026-09-01" → Date (local midnight); invalid → null */
function parseDay(v: string): Date | null {
  const m = v.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "7d" / "2w" / "3m" / "1y" → Date that many units before `now`; invalid → null */
function parseRelative(v: string, now: number): Date | null {
  const m = v.match(/^(\d+)([dwmy])$/i);
  if (!m) return null;
  return new Date(now - Number(m[1]) * UNIT_DAYS[m[2].toLowerCase()] * DAY_MS);
}

export function buildImapSearch(query: string, isGmail: boolean, now = Date.now()): ImapCriteria {
  const q = (query ?? "").trim();
  if (!q) return { all: true };
  if (isGmail) return { gmraw: q };

  const criteria: ImapCriteria = {};
  const words: string[] = [];
  const tokenRe = /(-?)(\w+):("[^"]*"|\S+)|("[^"]*"|\S+)/g;

  for (const m of q.matchAll(tokenRe)) {
    if (m[4] !== undefined) {
      words.push(unquote(m[4]));
      continue;
    }
    const negated = m[1] === "-";
    const op = m[2].toLowerCase();
    const val = unquote(m[3]);
    if (negated) continue; // -from:x etc. — not expressible simply; ignore, don't invert meaning

    switch (op) {
      case "is":
        if (val === "unread")  criteria.seen = false;
        else if (val === "read")    criteria.seen = true;
        else if (val === "starred") criteria.flagged = true;
        break;
      case "from":    criteria.from = val; break;
      case "to":      criteria.to = val; break;
      case "cc":      criteria.cc = val; break;
      case "subject": criteria.subject = val; break;
      case "newer_than": { const d = parseRelative(val, now); if (d) criteria.since = d; break; }
      case "older_than": { const d = parseRelative(val, now); if (d) criteria.before = d; break; }
      case "after":
      case "since":      { const d = parseDay(val); if (d) criteria.since = d; break; }
      case "before":     { const d = parseDay(val); if (d) criteria.before = d; break; }
      default:
        // has:, in:, label:, category:, filename: … — no faithful IMAP equivalent
        break;
    }
  }

  if (words.length) criteria.text = words.join(" ");
  return Object.keys(criteria).length ? criteria : { all: true };
}
