const winston = require("winston");
const expressWinston = require("express-winston");

const messageFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(
    ({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`
  )
);

/**
 * Request logger
 * Logs all incoming HTTP requests
 */
const requestLogger = expressWinston.logger({
  meta: false,
  msg: "{{req.method}} HTTP {{res.statusCode}}",
  transports: [
    new winston.transports.Console({
      format: messageFormat,
    }),
    new winston.transports.File({
      filename: "request.log",
      format: winston.format.json(),
    }),
  ],
});

/**
 * Error logger
 * Logs only errors passed to next(err)
 */
const errorLogger = expressWinston.errorLogger({
  meta: false,
  msg: "{{req.method}} HTTP request error",
  exceptionToMeta: (error) => {
    const status = error?.statusCode ?? error?.status;
    return { status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500 };
  },
  transports: [
    new winston.transports.Console({
      format: messageFormat,
    }),
    new winston.transports.File({
      filename: "error.log",
      format: winston.format.json(),
    }),
  ],
});

module.exports = {
  requestLogger,
  errorLogger,
};
