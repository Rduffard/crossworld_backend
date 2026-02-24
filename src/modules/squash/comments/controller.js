const mongoose = require("mongoose");
const Comment = require("./model");

const BadRequestError = require("../../../errors/bad-request-error");
const ForbiddenError = require("../../../errors/forbidden-error");
const NotFoundError = require("../../../errors/not-found-error");

/**
 * GET /squash/comments?bugId=<id>
 */
const getComments = async (req, res, next) => {
  try {
    const { bugId } = req.query;

    if (!bugId) {
      throw new BadRequestError("bugId query param is required");
    }

    if (!mongoose.isValidObjectId(bugId)) {
      throw new BadRequestError("Invalid bugId");
    }

    const comments = await Comment.find({ bugId })
      .sort({ createdAt: -1 })
      .populate("author", "name email avatar")
      .lean();

    res.send(comments);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /squash/comments
 * body: { bugId, text, attachments?: string[] }
 */
const createComment = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      throw new ForbiddenError("Authentication required");
    }

    const { bugId, text, attachments = [] } = req.body;

    if (!bugId || !mongoose.isValidObjectId(bugId)) {
      throw new BadRequestError("Valid bugId is required");
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      throw new BadRequestError("Comment text is required");
    }

    const safeAttachments = Array.isArray(attachments)
      ? attachments
          .filter((u) => typeof u === "string")
          .map((u) => u.trim())
          .filter(Boolean)
      : [];

    const created = await Comment.create({
      bugId,
      author: req.user._id,
      text: text.trim(),
      attachments: safeAttachments,
    });

    const populated = await Comment.findById(created._id)
      .populate("author", "name email avatar")
      .lean();

    res.status(201).send(populated);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /squash/comments/:commentId
 * Only the author can delete
 */
const deleteComment = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      throw new ForbiddenError("Authentication required");
    }

    const { commentId } = req.params;

    if (!mongoose.isValidObjectId(commentId)) {
      throw new BadRequestError("Invalid commentId");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      throw new NotFoundError("Comment not found");
    }

    if (String(comment.author) !== String(req.user._id)) {
      throw new ForbiddenError("You can only delete your own comments");
    }

    await Comment.deleteOne({ _id: commentId });

    res.send({ message: "Comment deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getComments,
  createComment,
  deleteComment,
};
