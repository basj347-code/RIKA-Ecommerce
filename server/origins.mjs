// Browser mutation requests must come from an explicitly trusted storefront origin.
// Vite serves the local app on both loopback hostnames, depending on how it is opened.
export function createOriginPolicy({appOrigin='http://localhost:5173', production=false, additionalOrigins=''}={}) {
  const canonical = normalizeOrigin(appOrigin);
  if (!canonical) throw new Error('APP_ORIGIN must be an http(s) URL, for example http://localhost:5173');
  const allowed = new Set([canonical]);
  if (!production) {
    for (const local of ['http://localhost:5173','http://127.0.0.1:5173','http://[::1]:5173']) allowed.add(local);
  }
  for (const entry of additionalOrigins.split(',')) {
    if (!entry.trim()) continue;
    const value=normalizeOrigin(entry.trim());
    if (!value) throw new Error('Invalid APP_ALLOWED_ORIGINS entry: '+entry.trim());
    allowed.add(value);
  }
  return {canonical, allowed, permits(requestOrigin) {
    if (!requestOrigin) return true; // e.g. same-origin non-browser clients; X-Rika-Request is still required
    const normalized=normalizeOrigin(requestOrigin);
    return normalized!==null && allowed.has(normalized);
  }};
}
function normalizeOrigin(raw) {
  try {
    const value=new URL(raw);
    if (!['http:','https:'].includes(value.protocol) || value.username || value.password || value.pathname!=='/' || value.search || value.hash) return null;
    return value.origin;
  } catch {return null;}
}
