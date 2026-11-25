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

function validArtifactImport(files) {
  return Array.isArray(files) && files.length > 0 && files.length <= ARTIFACT_LIMIT &&
    new Set(files.map((file) => typeof file?.name === "string" ? file.name.toLowerCase() : null)).size === files.length &&
    files.every((file) => {
      const mime = artifactMime(file?.name);
      return !!mime && typeof file.source === "string" && file.source.length <= 240 &&
        /^10_Active_Experiments\/[a-z\d _.-]+(?:\/[a-z\d _.-]+)*$/i.test(file.source) &&
        file.source.split("/").every((part) => part !== "." && part !== ".." && !/[ .]$/.test(part) &&
          !/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(part)) &&
        artifactMime(file.source.split("/").at(-1)) === mime &&
        Number.isSafeInteger(file.size) && file.size >= (mime === GLB_MIME ? 20 : 12) &&
        file.size <= artifactMaxBytes(mime) && typeof file.sha256 === "string" && /^[\da-f]{64}$/.test(file.sha256);
    });
}
module.exports = { ARTIFACT_LIMIT, GLB_MIME, artifactMime, artifactMaxBytes, validArtifactImport };
