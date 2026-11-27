const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { errors } = require("celebrate");
const { Server } = require("socket.io");

const mainRouter = require("./routes/index");
const operations = require("./modules/operations/routes");
const errorHandler = require("./core/middleware/errorHandler");
const { requestLogger, errorLogger } = require("./core/middleware/logger");
const {
  registerCommunitySockets,
} = require("./modules/community/sockets/communitySocket");

const connectDB = require("./config/db");
const { PORT } = require("./config/env");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

// DB
connectDB().then(() => {
  const reconcile = async () => {
    try {
      await operations.reconcileExecutive();
    } catch {
      console.error("Operations supervisor reconciliation failed.");
    } finally {
      setTimeout(reconcile, 30_000).unref();
    }
  };
  void reconcile();
});

const corsMiddleware = cors({ origin: true, credentials: true });

// Operations carries private prompts and device credentials. Keep it outside
// the shared request and error loggers.
app.use("/operations", corsMiddleware, operations);
app.use(requestLogger);
app.use(corsMiddleware);

// body parsing
app.use(express.json());

// routes
app.get("/healthz", (_req, res) => {
  res.sendStatus(mongoose.connection.readyState === 1 ? 200 : 503);
});

app.use("/", mainRouter);

// error logging + handling
app.use(errorLogger);
app.use(errors());
app.use(errorHandler);

registerCommunitySockets(io);

// server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = {
  app,
  server,
  io,
};
