const express = require("express");
const cors = require("cors");
const { errors } = require("celebrate");

require("dotenv").config();

const mainRouter = require("./routes/index");
const errorHandler = require("./middlewares/errorHandler");
const { requestLogger, errorLogger } = require("./middlewares/logger");

const connectDB = require("./db/connect");

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
const { PORT = 3001 } = process.env;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
