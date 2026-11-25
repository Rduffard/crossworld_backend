const ARTIFACT_LIMIT = 4;
const ARTIFACT_BYTES = 32 * 1024 * 1024;
const GLB_MIME = "model/gltf-binary";
const configuredGlbBytes = Number(process.env.OPERATIONS_GLB_MAX_BYTES);
const GLB_BYTES = Number.isSafeInteger(configuredGlbBytes) && configuredGlbBytes >= 20 &&
  configuredGlbBytes <= 100 * 1024 * 1024 ? configuredGlbBytes : ARTIFACT_BYTES;

const extensions = new Map([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["webp", "image/webp"],
  ["mp4", "video/mp4"], ["mov", "video/quicktime"], ["webm", "video/webm"],
  ["glb", GLB_MIME],
]);

function artifactMime(name) {
  if (typeof name !== "string" || !/^[a-z\d][\da-z ._-]{0,115}\.(?:png|jpe?g|webp|mp4|mov|webm|glb)$/i.test(name) ||
      /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\s*\.|\s*$)/i.test(name)) return null;
  return extensions.get(name.slice(name.lastIndexOf(".") + 1).toLowerCase()) || null;
}

const artifactMaxBytes = (mime) => mime === GLB_MIME ? GLB_BYTES : ARTIFACT_BYTES;
module.exports = { ARTIFACT_LIMIT, GLB_MIME, artifactMime, artifactMaxBytes };
