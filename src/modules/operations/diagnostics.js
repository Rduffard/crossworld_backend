const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"]);

function failureDiagnostic(error, area) {
  return {
    area,
    event: "request-failed",
    code: NETWORK_CODES.has(error?.code) ? error.code : "UNCLASSIFIED",
  };
}

function redact(value, deviceToken) {
  let text = value == null ? "" : String(value).replaceAll("\0", "");
  if (deviceToken) text = text.replaceAll(deviceToken, "[redacted]");
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[redacted]")
    .replace(/\bBearer\s+[^\s"',;}]+/gi, "Bearer [redacted]")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{16,}|github_pat_[\w]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, "[redacted]")
    .replace(/((?:[\w-]*(?:token|secret|password|api[_-]?key)|authorization|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, "$1[redacted]");
}

const preflightChanged = "The local mission preflight changed after relay admission.";

module.exports = { failureDiagnostic, preflightChanged, redact };
