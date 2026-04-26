const router = require("express").Router();

const auth = require("../../../core/middleware/auth");
const { optionalAuth } = require("../middleware/access");
const {
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
} = require("../controllers/communityController");
const {
  validateCreateComment,
  validateCreateSpace,
  validateCreateThread,
  validateDeleteComment,
  validateDeleteThread,
  validateMemberAction,
  validateModerateThread,
  validateSpaceId,
  validateSpaceMemberTarget,
  validateSpacesQuery,
  validateSpaceSlug,
  validateSpaceThreads,
  validateThreadComments,
  validateUpdateSpace,
} = require("../validators");

router.get("/spaces", optionalAuth, validateSpacesQuery, listSpaces);
router.get("/spaces/:slug", optionalAuth, validateSpaceSlug, getSpace);
router.post("/spaces", auth, validateCreateSpace, createSpace);
router.patch("/spaces/:spaceId", auth, validateUpdateSpace, updateSpace);
router.delete("/spaces/:spaceId", auth, validateSpaceId, deleteSpace);

router.post("/spaces/:spaceId/join", auth, validateMemberAction, joinSpace);
router.post("/spaces/:spaceId/request", auth, validateMemberAction, requestSpaceAccess);
router.get("/spaces/:spaceId/members", auth, validateMemberAction, listMembers);
router.post("/spaces/:spaceId/members/:userId/approve", auth, validateSpaceMemberTarget, approveMember);
router.post("/spaces/:spaceId/members/:userId/promote", auth, validateSpaceMemberTarget, promoteMember);
router.post("/spaces/:spaceId/members/:userId/demote", auth, validateSpaceMemberTarget, demoteMember);
router.post("/spaces/:spaceId/members/:userId/ban", auth, validateSpaceMemberTarget, banMember);
router.delete("/spaces/:spaceId/members/:userId", auth, validateSpaceMemberTarget, removeMember);

router.get("/spaces/:spaceId/threads", optionalAuth, validateSpaceThreads, listThreads);
router.post("/spaces/:spaceId/threads", auth, validateCreateThread, createThread);
router.patch("/threads/:threadId/moderation", auth, validateModerateThread, moderateThread);
router.delete("/threads/:threadId", auth, validateDeleteThread, deleteThread);

router.get("/threads/:threadId/comments", optionalAuth, validateThreadComments, listComments);
router.post("/threads/:threadId/comments", auth, validateCreateComment, createComment);
router.delete("/comments/:commentId", auth, validateDeleteComment, deleteComment);

module.exports = router;
