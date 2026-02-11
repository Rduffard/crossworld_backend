const { isCelebrateError } = require("celebrate");

module.exports = (err, req, res, next) => {
  // Celebrate/Joi validation errors
  if (isCelebrateError(err)) {
    const details = [];

    for (const [, joiError] of err.details) {
      for (const d of joiError.details) {
        details.push({
          message: d.message, // ✅ this is where your .messages() shows up
          path: d.path,
          type: d.type,
        });
      }
    }

    return res.status(400).send({
      message: "Validation failed",
      details,
    });
  }

  // fallback
  const { statusCode = 500, message } = err;
  res.status(statusCode).send({
    message: statusCode === 500 ? "An error occurred on the server" : message,
  });
};
