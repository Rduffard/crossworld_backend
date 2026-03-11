const express = require("express");
const cors = require("cors");
const { errors } = require("celebrate");

const mainRouter = require("./routes/index");
const errorHandler = require("./core/middleware/errorHandler");
const { requestLogger, errorLogger } = require("./core/middleware/logger");

const connectDB = require("./config/db");
const { PORT } = require("./config/env");

const app = express();

// DB
connectDB();

// logging
app.use(requestLogger);

// CORS – dev friendly, supports multiple local frontends
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// body parsing
app.use(express.json());

// routes
app.use("/", mainRouter);

// error logging + handling
app.use(errorLogger);
app.use(errors());
app.use(errorHandler);

// server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
