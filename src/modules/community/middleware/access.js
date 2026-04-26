const jwt = require("jsonwebtoken");

const { JWT_SECRET } = require("../../../config/env");
const CommunityMembership = require("../models/CommunityMembership");
const ForbiddenError = require("../../../core/errors/forbidden-error");
const UnauthorizedError = require("../../../core/errors/unauthorized-error");

const userIdOf = (user) => String(user?._id || user?.id || user || "");
const userIdsMatch = (left, right) => Boolean(left && right && String(left) === String(right));

const isSpaceOwner = (userId, space) =>
  userIdsMatch(userIdOf(userId), space?.owner?._id || space?.owner);

const getMembership = async (userId, spaceId) => {
  if (!userId || !spaceId) {
    return null;
  }

  return CommunityMembership.findOne({
    spaceId,
    userId: userIdOf(userId),
  });
};

const hasActiveMembership = async (userId, spaceId) => {
  const membership = await getMembership(userId, spaceId);
  return membership?.status === "active" ? membership : null;
};

const canViewSpace = async (userId, space) => {
  if (!space) {
    return false;
  }

  if (isSpaceOwner(userId, space)) {
    return true;
  }

  const membership = await getMembership(userId, space._id || space.id);

  if (membership?.status === "banned") {
    return false;
  }

  if (space.visibility === "public") {
    return true;
  }

  return membership?.status === "active";
};

const canCreateThread = async (userId, space) => {
  if (!userId || !space) {
    return false;
  }

  if (isSpaceOwner(userId, space)) {
    return true;
  }

  if (space.visibility === "public") {
    const membership = await getMembership(userId, space._id || space.id);
    return !membership || membership.status === "active";
  }

  const membership = await hasActiveMembership(userId, space._id || space.id);
  return Boolean(membership);
};

const canModerateSpace = async (userId, space) => {
  if (!userId || !space) {
    return false;
  }

  if (isSpaceOwner(userId, space)) {
    return true;
  }

  const membership = await hasActiveMembership(userId, space._id || space.id);
  return ["admin", "moderator"].includes(membership?.role);
};

const canManageMembers = async (userId, space) => {
  if (!userId || !space) {
    return false;
  }

  if (isSpaceOwner(userId, space)) {
    return true;
  }

  const membership = await hasActiveMembership(userId, space._id || space.id);
  return membership?.role === "admin";
};

const canManageSpaceSettings = async (userId, space) => {
  if (!userId || !space) {
    return false;
  }

  if (isSpaceOwner(userId, space)) {
    return true;
  }

  const membership = await hasActiveMembership(userId, space._id || space.id);
  return membership?.role === "admin";
};

const optionalAuth = (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return next();
  }

  const token = authorization.replace("Bearer ", "");

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }

  return next();
};

const requireSpaceViewAccess = (spaceResolver) => async (req, res, next) => {
  try {
    const space = await spaceResolver(req);

    if (!(await canViewSpace(req.user, space))) {
      if (!req.user) {
        throw new UnauthorizedError("Authorization required");
      }

      throw new ForbiddenError("You do not have access to this private space");
    }

    req.communitySpace = space;
    return next();
  } catch (err) {
    return next(err);
  }
};

const requireSpacePostAccess = (spaceResolver) => async (req, res, next) => {
  try {
    const space = await spaceResolver(req);

    if (!req.user) {
      throw new UnauthorizedError("Authorization required");
    }

    if (!(await canCreateThread(req.user, space))) {
      throw new ForbiddenError("You do not have permission to post in this space");
    }

    req.communitySpace = space;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  canCreateThread,
  canManageMembers,
  canManageSpaceSettings,
  canModerateSpace,
  canViewSpace,
  getMembership,
  hasActiveMembership,
  isSpaceOwner,
  optionalAuth,
  requireSpaceViewAccess,
  requireSpacePostAccess,
};
