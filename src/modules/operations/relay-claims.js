function relayJobCapabilities(host, { extendedPrompts = true, artifactImport = true } = {}) {
  return {
    effort: { $in: host.efforts ?? [] },
    ...(host.missionOnly ? { requiresMissionPreflight: true } : {}),
    ...(extendedPrompts && host.extendedPrompts === true ? {} : { requiresExtendedPrompt: { $ne: true } }),
    ...(host.boundedCorrections === true ? {} : { workerRole: { $ne: "correction" } }),
    ...(host.browserVerification === true ? {} : { browserVerification: { $ne: true } }),
    ...(host.blueprintBranches === true ? {} : { blueprintTyped: { $ne: true } }),
    ...(host.media === true ? {} : { mediaInputs: { $exists: false } }),
    ...(host.mediaOutput === true ? {} : { outputMedia: { $ne: true } }),
    ...(artifactImport && host.artifactImport === true ? {} : { artifactImport: { $exists: false } }),
    ...(host.employeeConversations === true ? {} : { "conversationActor.id": { $exists: false } }),
    $and: [
      { $or: [{ profile: { $ne: "scoped" } }, { scopedRevision: host.scopedRevision || "" }] },
      { $or: [{ profile: { $exists: false } }, { profile: { $in: host.profiles ?? ["read-only"] } }] },
    ],
  };
}

module.exports = { relayJobCapabilities };
