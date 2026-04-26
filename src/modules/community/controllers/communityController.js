const CommunitySpace = require("../models/CommunitySpace");
const CommunityThread = require("../models/CommunityThread");
const CommunityComment = require("../models/CommunityComment");
const CommunityNotification = require("../models/CommunityNotification");
const CommunityMembership = require("../models/CommunityMembership");
const { emitCommunityEvent } = require("../sockets/communitySocket");
const {
  canCreateThread,
  canManageMembers,
  canManageSpaceSettings,
  canModerateSpace,
  canViewSpace,
  getMembership,
  isSpaceOwner,
} = require("../middleware/access");
const BadRequestError = require("../../../core/errors/bad-request-error");
const ConflictError = require("../../../core/errors/conflict-error");
const ForbiddenError = require("../../../core/errors/forbidden-error");
const NotFoundError = require("../../../core/errors/not-found-error");
const UnauthorizedError = require("../../../core/errors/unauthorized-error");

const defaultThreadPageSize = 20;
const defaultCommentPageSize = 30;
const authorProjection = "name email avatar";
const membershipUserProjection = "name email avatar";
const profanityFilterHook = (value) => value;
const toObjectIdString = (value) => String(value?._id || value || "");

const slugify = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const getSafePage = (value) => {
  const page = Number(value) || 1;
  return page > 0 ? page : 1;
};

const getSafeLimit = (value, fallback, max) => {
  const parsed = Number(value) || fallback;
  return Math.min(parsed > 0 ? parsed : fallback, max);
};

const ensureValidSlug = (slug) => {
  if (!slug) {
    throw new BadRequestError("A valid slug is required");
  }
};

const ensureUniqueSlug = async (slug, excludeId = null) => {
  const existing = await CommunitySpace.findOne(
    excludeId ? { slug, _id: { $ne: excludeId } } : { slug }
  ).lean();

  if (existing) {
    throw new ConflictError("A community space with that slug already exists");
  }
};

const requireAuthenticatedUser = (user) => {
  if (!user) {
    throw new UnauthorizedError("Authorization required");
  }
};

const ensureSpaceExists = async (spaceId) => {
  const space = await CommunitySpace.findById(spaceId).populate("owner", authorProjection);
  if (!space) throw new NotFoundError("Community space not found");
  return space;
};

const ensureThreadExists = async (threadId) => {
  const thread = await CommunityThread.findById(threadId)
    .populate("author", authorProjection)
    .populate({ path: "spaceId", populate: { path: "owner", select: authorProjection } });
  if (!thread) throw new NotFoundError("Community thread not found");
  return thread;
};

const ensureCommentExists = async (commentId) => {
  const comment = await CommunityComment.findById(commentId).populate("author", authorProjection);
  if (!comment) throw new NotFoundError("Community comment not found");
  return comment;
};

const ensureOwnerMembership = async (space) =>
  CommunityMembership.findOneAndUpdate(
    { spaceId: space._id, userId: space.owner._id || space.owner },
    { $set: { role: "owner", status: "active" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

const attachMembershipData = async (spaces, viewerId = null) => {
  if (!spaces.length) return [];

  const memberships = await CommunityMembership.find({
    spaceId: { $in: spaces.map((space) => space._id) },
    status: { $in: ["active", "pending"] },
  })
    .select("spaceId userId role status createdAt updatedAt")
    .populate("userId", membershipUserProjection)
    .lean();

  const bySpaceId = memberships.reduce((accumulator, membership) => {
    const key = String(membership.spaceId);
    if (!accumulator[key]) accumulator[key] = [];
    accumulator[key].push(membership);
    return accumulator;
  }, {});

  return spaces.map((space) => {
    const raw = typeof space.toObject === "function" ? space.toObject() : { ...space };
    const spaceMemberships = bySpaceId[String(space._id)] || [];
    const activeMembers = spaceMemberships.filter((membership) => membership.status === "active");
    const pendingMembers = spaceMemberships.filter((membership) => membership.status === "pending");
    const viewerMembership = viewerId
      ? spaceMemberships.find(
          (membership) => toObjectIdString(membership.userId) === String(viewerId)
        ) || null
      : null;

    return {
      ...raw,
      members: activeMembers.map((membership) => membership.userId),
      memberRequests: pendingMembers.map((membership) => membership.userId),
      memberCount: activeMembers.length,
      pendingCount: pendingMembers.length,
      viewerMembership: viewerMembership
        ? { role: viewerMembership.role, status: viewerMembership.status }
        : null,
    };
  });
};

const getSerializedSpaceBySlugOrThrow = async (slug, viewerId = null) => {
  const space = await CommunitySpace.findOne({ slug }).populate("owner", authorProjection);
  if (!space) throw new NotFoundError("Community space not found");
  await ensureOwnerMembership(space);
  const [serialized] = await attachMembershipData([space], viewerId);
  return serialized;
};

const getSerializedSpaceByIdOrThrow = async (spaceId, viewerId = null) => {
  const space = await ensureSpaceExists(spaceId);
  await ensureOwnerMembership(space);
  const [serialized] = await attachMembershipData([space], viewerId);
  return serialized;
};

const getActiveMemberIds = async (space) => {
  const activeMemberships = await CommunityMembership.find({
    spaceId: space._id,
    status: "active",
  })
    .select("userId")
    .lean();

  const ids = new Set([String(space.owner._id || space.owner)]);
  activeMemberships.forEach((membership) => ids.add(String(membership.userId)));
  return Array.from(ids);
};

const ensureUnreadCounter = (space, userId) => {
  const existing = space.unreadCounters.find((entry) => toObjectIdString(entry.user) === String(userId));
  if (!existing) {
    space.unreadCounters.push({ user: userId, unreadCount: 0, lastReadAt: null });
  }
};

const incrementUnreadCounters = (space, recipientIds, actorId) => {
  recipientIds.forEach((recipientId) => {
    if (String(recipientId) === String(actorId)) return;
    const counter = space.unreadCounters.find(
      (entry) => toObjectIdString(entry.user) === String(recipientId)
    );
    if (counter) counter.unreadCount += 1;
    else space.unreadCounters.push({ user: recipientId, unreadCount: 1, lastReadAt: null });
  });
};

const pruneUnreadCounter = (space, userId) => {
  space.unreadCounters = space.unreadCounters.filter(
    (entry) => toObjectIdString(entry.user) !== String(userId)
  );
};

const createNotifications = async ({ recipients, actorId, type, spaceId, threadId, payload }) => {
  const docs = recipients
    .filter((recipientId) => String(recipientId) !== String(actorId))
    .map((recipientId) => ({
      user: recipientId,
      spaceId: spaceId || null,
      threadId: threadId || null,
      type,
      payload,
    }));

  if (docs.length) await CommunityNotification.insertMany(docs);
};

const requireSpaceViewAuthorization = async (user, space) => {
  if (!(await canViewSpace(user, space))) {
    if (!user) throw new UnauthorizedError("Authorization required");
    throw new ForbiddenError("You do not have access to this space");
  }
};

const requireSpacePostAuthorization = async (user, space) => {
  requireAuthenticatedUser(user);
  if (!(await canCreateThread(user, space))) {
    throw new ForbiddenError("You do not have permission to post in this space");
  }
};

const requireModerationAuthorization = async (user, space) => {
  requireAuthenticatedUser(user);
  if (!(await canModerateSpace(user, space))) {
    throw new ForbiddenError("You do not have permission to moderate this space");
  }
};

const requireManageMembersAuthorization = async (user, space) => {
  requireAuthenticatedUser(user);
  if (!(await canManageMembers(user, space))) {
    throw new ForbiddenError("You do not have permission to manage members in this space");
  }
};

const requireManageSpaceSettingsAuthorization = async (user, space) => {
  requireAuthenticatedUser(user);
  if (!(await canManageSpaceSettings(user, space))) {
    throw new ForbiddenError("You do not have permission to manage this space");
  }
};

const requireOwnerAuthorization = (user, space) => {
  requireAuthenticatedUser(user);
  if (!isSpaceOwner(user, space)) {
    throw new ForbiddenError("Only the space owner can perform this action");
  }
};

const getTargetMembershipOrThrow = async (spaceId, userId) => {
  const membership = await CommunityMembership.findOne({ spaceId, userId }).populate(
    "userId",
    membershipUserProjection
  );
  if (!membership) throw new NotFoundError("Membership not found");
  return membership;
};

const ensureTargetManageable = (actor, space, membership) => {
  if (
    membership.role === "owner" ||
    String(membership.userId._id || membership.userId) === String(space.owner._id || space.owner)
  ) {
    throw new BadRequestError("The space owner cannot be modified");
  }

  if (membership.role === "admin" && !isSpaceOwner(actor, space)) {
    throw new ForbiddenError("Only the space owner can manage admins");
  }
};

const listSpaces = async (req, res, next) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const authUserId = req.user?._id;

    if (authUserId) {
      const activeMembershipSpaceIds = await CommunityMembership.find({
        userId: authUserId,
        status: "active",
      }).distinct("spaceId");

      query.$or = [
        { visibility: "public" },
        { owner: authUserId },
        { _id: { $in: activeMembershipSpaceIds } },
      ];
    } else {
      query.visibility = "public";
    }

    const spaces = await CommunitySpace.find(query)
      .sort({ lastActiveAt: -1, createdAt: -1, name: 1 })
      .populate("owner", authorProjection);

    await Promise.all(spaces.map((space) => ensureOwnerMembership(space)));
    res.send(await attachMembershipData(spaces, authUserId));
  } catch (err) {
    next(err);
  }
};

const getSpace = async (req, res, next) => {
  try {
    const space = await getSerializedSpaceBySlugOrThrow(req.params.slug, req.user?._id);
    await requireSpaceViewAuthorization(req.user, space);
    res.send(space);
  } catch (err) {
    next(err);
  }
};

const createSpace = async (req, res, next) => {
  try {
    const name = req.body.name.trim();
    const slug = slugify(req.body.slug || name);
    ensureValidSlug(slug);
    await ensureUniqueSlug(slug);

    const createdSpace = await CommunitySpace.create({
      name,
      slug,
      description: req.body.description?.trim() || "",
      icon: req.body.icon?.trim() || "",
      visibility: req.body.visibility || "public",
      joinMode: req.body.joinMode || "request",
      owner: req.user._id,
      unreadCounters: [{ user: req.user._id, unreadCount: 0, lastReadAt: new Date() }],
      lastActiveAt: new Date(),
    });

    await CommunityMembership.create({
      spaceId: createdSpace._id,
      userId: req.user._id,
      role: "owner",
      status: "active",
    });

    const populatedSpace = await getSerializedSpaceByIdOrThrow(createdSpace._id, req.user._id);
    emitCommunityEvent({
      eventName: "community:spaceCreated",
      payload: populatedSpace,
      namespaceWide: true,
      spaceId: String(createdSpace._id),
    });

    res.status(201).send(populatedSpace);
  } catch (err) {
    next(err);
  }
};

const updateSpace = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireManageSpaceSettingsAuthorization(req.user, space);

    if (req.body.name !== undefined) {
      space.name = req.body.name.trim();
    }

    if (req.body.slug !== undefined || req.body.name !== undefined) {
      const nextSlug = slugify(req.body.slug || space.slug || req.body.name || space.name);
      ensureValidSlug(nextSlug);
      await ensureUniqueSlug(nextSlug, space._id);
      space.slug = nextSlug;
    }

    if (req.body.description !== undefined) {
      space.description = req.body.description.trim();
    }
    if (req.body.icon !== undefined) {
      space.icon = req.body.icon.trim();
    }
    if (req.body.visibility !== undefined) {
      space.visibility = req.body.visibility;
    }
    if (req.body.joinMode !== undefined) {
      space.joinMode = req.body.joinMode;
    }

    await space.save();
    const serializedSpace = await getSerializedSpaceByIdOrThrow(space._id, req.user?._id);

    emitCommunityEvent({
      eventName: "community:spaceUpdated",
      payload: serializedSpace,
      namespaceWide: true,
      spaceId: String(space._id),
    });

    res.send(serializedSpace);
  } catch (err) {
    next(err);
  }
};

const deleteSpace = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    requireOwnerAuthorization(req.user, space);

    const threads = await CommunityThread.find({ spaceId: space._id }).select("_id").lean();
    const threadIds = threads.map((thread) => thread._id);

    await CommunityComment.deleteMany({ threadId: { $in: threadIds } });
    await CommunityNotification.deleteMany({
      $or: [{ spaceId: space._id }, { threadId: { $in: threadIds } }],
    });
    await CommunityMembership.deleteMany({ spaceId: space._id });
    await CommunityThread.deleteMany({ spaceId: space._id });
    await CommunitySpace.deleteOne({ _id: space._id });

    emitCommunityEvent({
      eventName: "community:spaceDeleted",
      payload: { _id: String(space._id), slug: space.slug },
      namespaceWide: true,
      spaceId: String(space._id),
    });

    res.send({ message: "Community space deleted" });
  } catch (err) {
    next(err);
  }
};

const listThreads = async (req, res, next) => {
  try {
    const page = getSafePage(req.query.page);
    const limit = getSafeLimit(req.query.limit, defaultThreadPageSize, 50);
    const sort = req.query.sort || "newest";
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";
    const space = await getSerializedSpaceByIdOrThrow(req.params.spaceId, req.user?._id);

    await requireSpaceViewAuthorization(req.user, space);

    const threadQuery = { spaceId: req.params.spaceId };
    if (search) {
      threadQuery.title = { $regex: search, $options: "i" };
    }

    const totalItems = await CommunityThread.countDocuments(threadQuery);
    const totalPages = totalItems ? Math.ceil(totalItems / limit) : 1;
    const sortQuery =
      sort === "most_active"
        ? { pinned: -1, replyCount: -1, lastActivityAt: -1, createdAt: -1 }
        : { pinned: -1, createdAt: -1 };

    const threads = await CommunityThread.find(threadQuery)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .populate("author", authorProjection)
      .lean();

    res.send({
      space,
      threads,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: { sort, search },
    });
  } catch (err) {
    next(err);
  }
};

const createThread = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireSpacePostAuthorization(req.user, space);

    const wantsModerationFlags =
      req.body.pinned !== undefined || req.body.locked !== undefined;

    if (wantsModerationFlags && !(await canModerateSpace(req.user, space))) {
      throw new ForbiddenError("Only moderators, admins, or owners can pin or lock threads");
    }

    const createdThread = await CommunityThread.create({
      title: profanityFilterHook(req.body.title.trim()),
      body: req.body.body ? profanityFilterHook(req.body.body.trim()) : "",
      spaceId: space._id,
      author: req.user._id,
      pinned: Boolean(req.body.pinned),
      locked: Boolean(req.body.locked),
      lastActivityAt: new Date(),
    });

    const recipientIds = await getActiveMemberIds(space);
    space.lastActiveAt = new Date();
    incrementUnreadCounters(space, recipientIds, req.user._id);
    await space.save();

    await createNotifications({
      recipients: recipientIds,
      actorId: req.user._id,
      type: "community.thread.created",
      spaceId: space._id,
      threadId: createdThread._id,
      payload: { title: createdThread.title },
    });

    const populatedThread = await CommunityThread.findById(createdThread._id)
      .populate("author", authorProjection)
      .populate("spaceId")
      .lean();

    emitCommunityEvent({
      eventName: "community:threadCreated",
      payload: populatedThread,
      spaceId: String(space._id),
    });

    res.status(201).send(populatedThread);
  } catch (err) {
    next(err);
  }
};

const moderateThread = async (req, res, next) => {
  try {
    const thread = await ensureThreadExists(req.params.threadId);
    const space = await ensureSpaceExists(thread.spaceId._id || thread.spaceId);
    await ensureOwnerMembership(space);
    await requireModerationAuthorization(req.user, space);

    if (req.body.pinned !== undefined) thread.pinned = req.body.pinned;
    if (req.body.locked !== undefined) thread.locked = req.body.locked;
    await thread.save();

    const updatedThread = await CommunityThread.findById(thread._id)
      .populate("author", authorProjection)
      .populate("spaceId")
      .lean();

    emitCommunityEvent({
      eventName: "community:threadUpdated",
      payload: updatedThread,
      spaceId: String(space._id),
      threadId: String(thread._id),
    });

    res.send(updatedThread);
  } catch (err) {
    next(err);
  }
};

const deleteThread = async (req, res, next) => {
  try {
    const thread = await ensureThreadExists(req.params.threadId);
    const space = await ensureSpaceExists(thread.spaceId._id || thread.spaceId);
    await ensureOwnerMembership(space);
    await requireModerationAuthorization(req.user, space);

    await CommunityComment.deleteMany({ threadId: thread._id });
    await CommunityNotification.deleteMany({
      $or: [{ threadId: thread._id }, { spaceId: space._id }],
    });
    await CommunityThread.deleteOne({ _id: thread._id });

    emitCommunityEvent({
      eventName: "community:threadRemoved",
      payload: { threadId: String(thread._id), spaceId: String(space._id) },
      spaceId: String(space._id),
      threadId: String(thread._id),
    });

    res.send({ message: "Thread removed" });
  } catch (err) {
    next(err);
  }
};

const listComments = async (req, res, next) => {
  try {
    const page = getSafePage(req.query.page);
    const limit = getSafeLimit(req.query.limit, defaultCommentPageSize, 100);
    const skip = (page - 1) * limit;
    const thread = await ensureThreadExists(req.params.threadId);
    const space = await getSerializedSpaceByIdOrThrow(thread.spaceId._id || thread.spaceId, req.user?._id);

    await requireSpaceViewAuthorization(req.user, space);

    const totalItems = await CommunityComment.countDocuments({ threadId: req.params.threadId });
    const totalPages = totalItems ? Math.ceil(totalItems / limit) : 1;
    const comments = await CommunityComment.find({ threadId: req.params.threadId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate("author", authorProjection)
      .lean();

    res.send({
      thread,
      comments,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

const createComment = async (req, res, next) => {
  try {
    const thread = await CommunityThread.findById(req.params.threadId);
    if (!thread) throw new NotFoundError("Community thread not found");

    const space = await ensureSpaceExists(thread.spaceId);
    await ensureOwnerMembership(space);
    await requireSpacePostAuthorization(req.user, space);
    if (thread.locked) throw new ForbiddenError("Thread is locked");

    const body = profanityFilterHook(req.body.body.trim());
    const createdComment = await CommunityComment.create({
      body,
      threadId: thread._id,
      author: req.user._id,
    });

    thread.replyCount += 1;
    thread.lastActivityAt = new Date();
    await thread.save();

    const recipientIds = await getActiveMemberIds(space);
    space.lastActiveAt = new Date();
    incrementUnreadCounters(space, recipientIds, req.user._id);
    await space.save();

    await createNotifications({
      recipients: recipientIds,
      actorId: req.user._id,
      type: "community.comment.created",
      spaceId: space._id,
      threadId: thread._id,
      payload: { bodyPreview: body.slice(0, 120) },
    });

    const populatedComment = await CommunityComment.findById(createdComment._id)
      .populate("author", authorProjection)
      .lean();

    emitCommunityEvent({
      eventName: "community:commentCreated",
      payload: { ...populatedComment, threadId: String(thread._id), spaceId: String(space._id) },
      spaceId: String(space._id),
      threadId: String(thread._id),
    });

    res.status(201).send(populatedComment);
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const comment = await ensureCommentExists(req.params.commentId);
    const thread = await CommunityThread.findById(comment.threadId);
    if (!thread) throw new NotFoundError("Community thread not found");

    const space = await ensureSpaceExists(thread.spaceId);
    await ensureOwnerMembership(space);
    await requireModerationAuthorization(req.user, space);

    await CommunityComment.deleteOne({ _id: comment._id });
    thread.replyCount = Math.max(0, thread.replyCount - 1);
    await thread.save();

    emitCommunityEvent({
      eventName: "community:commentRemoved",
      payload: {
        commentId: String(comment._id),
        threadId: String(thread._id),
        spaceId: String(space._id),
      },
      spaceId: String(space._id),
      threadId: String(thread._id),
    });

    res.send({ message: "Comment removed" });
  } catch (err) {
    next(err);
  }
};

const joinSpace = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    requireAuthenticatedUser(req.user);

    if (isSpaceOwner(req.user, space)) {
      return res.send(await getSerializedSpaceByIdOrThrow(space._id, req.user._id));
    }

    const membership = await getMembership(req.user._id, space._id);
    if (membership?.status === "banned") throw new ForbiddenError("You are banned from this space");
    if (membership?.status === "active") {
      return res.send(await getSerializedSpaceByIdOrThrow(space._id, req.user._id));
    }
    if (space.joinMode !== "open") {
      throw new ForbiddenError("This space does not allow direct joining");
    }

    await CommunityMembership.findOneAndUpdate(
      { spaceId: space._id, userId: req.user._id },
      { $set: { role: membership?.role || "member", status: "active" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    ensureUnreadCounter(space, req.user._id);
    await space.save();

    emitCommunityEvent({
      eventName: "community:memberJoined",
      payload: { spaceId: String(space._id), userId: String(req.user._id) },
      spaceId: String(space._id),
    });

    res.send(await getSerializedSpaceByIdOrThrow(space._id, req.user._id));
  } catch (err) {
    next(err);
  }
};

const requestSpaceAccess = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    requireAuthenticatedUser(req.user);

    if (isSpaceOwner(req.user, space)) return res.send({ message: "Already a member" });

    const membership = await getMembership(req.user._id, space._id);
    if (membership?.status === "banned") throw new ForbiddenError("You are banned from this space");
    if (membership?.status === "active") return res.send({ message: "Already a member" });
    if (space.joinMode !== "request") {
      throw new ForbiddenError("This space does not accept access requests");
    }
    if (membership?.status === "pending") {
      throw new ConflictError("You have already requested access to this space");
    }

    await CommunityMembership.findOneAndUpdate(
      { spaceId: space._id, userId: req.user._id },
      { $set: { role: membership?.role || "member", status: "pending" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    emitCommunityEvent({
      eventName: "community:requestCreated",
      payload: { spaceId: String(space._id), userId: String(req.user._id) },
      spaceId: String(space._id),
    });

    res.send({ message: "Access request submitted" });
  } catch (err) {
    next(err);
  }
};

const listMembers = async (req, res, next) => {
  try {
    const space = await getSerializedSpaceByIdOrThrow(req.params.spaceId, req.user?._id);
    await requireSpaceViewAuthorization(req.user, space);

    const memberships = await CommunityMembership.find({ spaceId: req.params.spaceId })
      .populate("userId", membershipUserProjection)
      .sort({ status: 1, role: -1, createdAt: 1 })
      .lean();

    res.send({
      space,
      members: memberships.map((membership) => ({
        _id: String(membership._id),
        user: membership.userId,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
};

const approveMember = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireManageMembersAuthorization(req.user, space);

    const membership = await getTargetMembershipOrThrow(space._id, req.params.userId);
    if (membership.status !== "pending") {
      throw new BadRequestError("Only pending requests can be approved");
    }

    membership.status = "active";
    membership.role = membership.role || "member";
    await membership.save();
    ensureUnreadCounter(space, req.params.userId);
    await space.save();

    emitCommunityEvent({
      eventName: "community:memberApproved",
      payload: {
        spaceId: String(space._id),
        userId: String(req.params.userId),
        role: membership.role,
        status: membership.status,
      },
      spaceId: String(space._id),
    });

    res.send({ message: "Member approved" });
  } catch (err) {
    next(err);
  }
};

const promoteMember = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireManageMembersAuthorization(req.user, space);

    const membership = await getTargetMembershipOrThrow(space._id, req.params.userId);
    ensureTargetManageable(req.user, space, membership);
    if (membership.status !== "active") {
      throw new BadRequestError("Only active members can be promoted");
    }

    if (membership.role === "member") {
      membership.role = "moderator";
    } else if (membership.role === "moderator") {
      if (!isSpaceOwner(req.user, space)) {
        throw new ForbiddenError("Only the space owner can promote admins");
      }
      membership.role = "admin";
    } else if (membership.role === "admin") {
      throw new BadRequestError("This member is already an admin");
    } else {
      throw new BadRequestError("This member cannot be promoted");
    }

    await membership.save();
    emitCommunityEvent({
      eventName: "community:memberRoleChanged",
      payload: {
        spaceId: String(space._id),
        userId: String(req.params.userId),
        role: membership.role,
        status: membership.status,
      },
      spaceId: String(space._id),
    });

    res.send({ message: "Member promoted", role: membership.role });
  } catch (err) {
    next(err);
  }
};

const demoteMember = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireManageMembersAuthorization(req.user, space);

    const membership = await getTargetMembershipOrThrow(space._id, req.params.userId);
    ensureTargetManageable(req.user, space, membership);
    if (membership.status !== "active") {
      throw new BadRequestError("Only active members can be demoted");
    }

    if (membership.role === "admin") {
      if (!isSpaceOwner(req.user, space)) {
        throw new ForbiddenError("Only the space owner can demote admins");
      }
      membership.role = "moderator";
    } else if (membership.role === "moderator") {
      membership.role = "member";
    } else if (membership.role === "member") {
      throw new BadRequestError("This member is already at the lowest role");
    } else {
      throw new BadRequestError("This member cannot be demoted");
    }

    await membership.save();
    emitCommunityEvent({
      eventName: "community:memberRoleChanged",
      payload: {
        spaceId: String(space._id),
        userId: String(req.params.userId),
        role: membership.role,
        status: membership.status,
      },
      spaceId: String(space._id),
    });

    res.send({ message: "Member demoted", role: membership.role });
  } catch (err) {
    next(err);
  }
};

const banMember = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireManageMembersAuthorization(req.user, space);

    const membership = await getTargetMembershipOrThrow(space._id, req.params.userId);
    ensureTargetManageable(req.user, space, membership);

    membership.status = "banned";
    if (membership.role !== "owner") membership.role = "member";
    await membership.save();

    pruneUnreadCounter(space, req.params.userId);
    await space.save();

    emitCommunityEvent({
      eventName: "community:memberBanned",
      payload: {
        spaceId: String(space._id),
        userId: String(req.params.userId),
        role: membership.role,
        status: membership.status,
      },
      spaceId: String(space._id),
    });

    res.send({ message: "Member banned" });
  } catch (err) {
    next(err);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const space = await ensureSpaceExists(req.params.spaceId);
    await ensureOwnerMembership(space);
    await requireManageMembersAuthorization(req.user, space);

    const membership = await getTargetMembershipOrThrow(space._id, req.params.userId);
    ensureTargetManageable(req.user, space, membership);

    await CommunityMembership.deleteOne({ _id: membership._id });
    pruneUnreadCounter(space, req.params.userId);
    await space.save();

    emitCommunityEvent({
      eventName: "community:memberRemoved",
      payload: { spaceId: String(space._id), userId: String(req.params.userId) },
      spaceId: String(space._id),
    });

    res.send({ message: "Member removed" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  approveMember,
  banMember,
  createComment,
  createSpace,
  createThread,
  deleteComment,
  deleteSpace,
  deleteThread,
  demoteMember,
  getSpace,
  joinSpace,
  listComments,
  listMembers,
  listSpaces,
  listThreads,
  moderateThread,
  promoteMember,
  removeMember,
  requestSpaceAccess,
  updateSpace,
};
