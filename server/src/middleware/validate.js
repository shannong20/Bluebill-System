const ApiError = require('../utils/ApiError');

/**
 * Validates `req[source]` against a Zod schema and replaces it with the
 * parsed (coerced, stripped) value. Throws a 422 with field-level details.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.reduce((acc, issue) => {
      const key = issue.path.join('.') || '_';
      if (!acc[key]) acc[key] = issue.message;
      return acc;
    }, {});
    return next(ApiError.unprocessable('Validation failed', details));
  }

  // req.query is a getter in Express 5 — assign to a fresh property instead.
  if (source === 'query') {
    Object.defineProperty(req, 'validatedQuery', { value: result.data, writable: true });
  } else {
    req[source] = result.data;
  }
  return next();
};

module.exports = validate;
