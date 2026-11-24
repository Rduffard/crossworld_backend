const ARTIFACT_LIMIT = 4;
const ARTIFACT_BYTES = 32 * 1024 * 1024;

const extensions = new Map([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["webp", "image/webp"],
  ["mp4", "video/mp4"], ["mov", "video/quicktime"], ["webm", "video/webm"],
]);

function artifactMime(name) {
  if (typeof name !== "string" || !/^[a-z\d][\da-z ._-]{0,115}\.(?:png|jpe?g|webp|mp4|mov|webm)$/i.test(name) ||
      /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\s*\.|\s*$)/i.test(name)) return null;
  return extensions.get(name.slice(name.lastIndexOf(".") + 1).toLowerCase()) || null;
}

module.exports = { ARTIFACT_LIMIT, ARTIFACT_BYTES, artifactMime };
