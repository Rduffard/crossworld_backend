const { isCelebrateError } = require("celebrate");

module.exports = (err, req, res, _next) => {
  const characterRequest=/^\/(?:api\/)?archipelago\/characters(?:\/|$)/.test(req.originalUrl??req.url??'');
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

    return res.status(characterRequest?422:400).send({
      message: "Validation failed",
      details,
      ...(characterRequest?{code:'validation_error',fieldPath:details[0]?.path.join('.')||'body'}:{}),
    });
  }

  // fallback
  const { statusCode = 500, message } = err;
  const status=characterRequest&&statusCode===400?422:statusCode;
  res.status(status).send({
    message: statusCode === 500 ? "An error occurred on the server" : message,
    ...(characterRequest?{code:typeof err.code==='string'?err.code:status===422?'validation_error':status===409?'state_conflict':status===403?'forbidden':status===404?'not_found':'request_failed',fieldPath:err.fieldPath??'body',...(Number.isSafeInteger(err.currentRevision)?{currentRevision:err.currentRevision}:{})}:{}),
  });
};
