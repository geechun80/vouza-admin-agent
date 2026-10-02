// Small helpers for the dashboard server: is a request's Host header this
// computer (Docker local-only mode refuses requests from the network and
// DNS-rebinding pages), and is a release version newer than ours?

/** Host header names this computer (localhost / 127.0.0.1 / [::1]), any port. */
export function isLocalHostHeader(host: string | undefined): boolean {
  const name = String(host || "").trim().toLowerCase().replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

/** "2.10.0" > "2.9.3"? Plain numeric semver compare; anything unparsable → false. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => v.trim().replace(/^v/i, "").split("-")[0].split(".").map((n) => Number(n));
  const a = parse(candidate);
  const b = parse(current);
  if (a.length < 2 || a.some((n) => !Number.isInteger(n)) || b.some((n) => !Number.isInteger(n))) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
