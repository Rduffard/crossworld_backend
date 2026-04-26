const jwt = require("jsonwebtoken");

const { JWT_SECRET } = require("../../../config/env");

let communityNamespace = null;
const activeUsers = new Map();

const isValidRoomId = (value) => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

const getSocketUserId = (socket) => {
  const authToken =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace("Bearer ", "");

  if (!authToken) {
    return null;
  }

  try {
    return String(jwt.verify(authToken, JWT_SECRET)._id);
  } catch {
    return null;
  }
};

const emitPresence = (userId, status) => {
  if (!communityNamespace || !userId) {
    return;
  }

  communityNamespace.emit("community:presenceChanged", {
    userId,
    status,
  });
};

const registerCommunitySockets = (io) => {
  communityNamespace = io.of("/community");

  communityNamespace.on("connection", (socket) => {
    const userId = getSocketUserId(socket);

    if (userId) {
      const connectionCount = activeUsers.get(userId) || 0;
      activeUsers.set(userId, connectionCount + 1);

      if (connectionCount === 0) {
        emitPresence(userId, "connected");
      }
    }

    socket.on("community:joinSpace", (spaceId) => {
      if (isValidRoomId(spaceId)) {
        socket.join(`space:${spaceId}`);
      }
    });

    socket.on("community:joinThread", (threadId) => {
      if (isValidRoomId(threadId)) {
        socket.join(`thread:${threadId}`);
      }
    });

    socket.on("community:leaveSpace", (spaceId) => {
      if (isValidRoomId(spaceId)) {
        socket.leave(`space:${spaceId}`);
      }
    });

    socket.on("community:leaveThread", (threadId) => {
      if (isValidRoomId(threadId)) {
        socket.leave(`thread:${threadId}`);
      }
    });

    socket.on("disconnect", () => {
      if (!userId) {
        return;
      }

      const connectionCount = activeUsers.get(userId) || 0;

      if (connectionCount <= 1) {
        activeUsers.delete(userId);
        emitPresence(userId, "disconnected");
        return;
      }

      activeUsers.set(userId, connectionCount - 1);
    });
  });

  return communityNamespace;
};

// Controllers save to Mongo first, then use this helper to fan out live updates.
const emitCommunityEvent = ({ eventName, payload, namespaceWide = false, spaceId, threadId }) => {
  if (!communityNamespace) {
    return;
  }

  if (namespaceWide) {
    communityNamespace.emit(eventName, payload);
  }

  if (spaceId) {
    communityNamespace.to(`space:${spaceId}`).emit(eventName, payload);
  }

  if (threadId) {
    communityNamespace.to(`thread:${threadId}`).emit(eventName, payload);
  }
};

module.exports = {
  registerCommunitySockets,
  emitCommunityEvent,
};
