const { createHash } = require('node:crypto');
function fail(message, statusCode = 422, details = {}) {
  throw Object.assign(new Error(message), { statusCode, ...details });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
function validateEnvelope(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) =>
        ![
          'operationId',
          'expectedRevision',
          'rulesVersion',
          'type',
          'payload',
        ].includes(k),
    )
  )
    fail('Invalid command envelope');
  if (
    typeof body.operationId !== 'string' ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(body.operationId) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0
  )
    fail('Command requires operationId and expectedRevision');
  if (body.rulesVersion !== 'SA-CHAR-1')
    fail('Rules version changed; reload character rules', 409, {
      code: 'rules_version_mismatch',
      fieldPath: 'rulesVersion',
    });
  if (
    typeof body.type !== 'string' ||
    !body.payload ||
    typeof body.payload !== 'object' ||
    Array.isArray(body.payload)
  )
    fail('Command requires a type and payload');
  return createHash('sha256')
    .update(JSON.stringify(canonical(body)))
    .digest('hex');
}
module.exports = { fail, validateEnvelope };
