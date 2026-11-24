/**
 * Strip secrets from URLs before they are logged. Any query parameter whose name looks like a
 * credential (code, state, token, secret, password, key, ...) keeps its name but loses its value.
 */
const SENSITIVE_PARAM = /^(code|state|session_state|id_token|access_token|refresh_token|token|secret|password|pass|key|api[_-]?key|sig|signature|otp)$/i;

export function redactUrl(url) {
  if (!url || !url.includes('?')) return url;
  const [path, query] = url.split('?', 2);
  const parts = query.split('&').map((pair) => {
    const [k] = pair.split('=', 1);
    return SENSITIVE_PARAM.test(decodeURIComponentSafe(k)) ? `${k}=[redacted]` : pair;
  });
  return `${path}?${parts.join('&')}`;
}

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
