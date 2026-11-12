export function notFoundHandler(_request, response) {
  response.status(404).json({ message: 'Route not found.' });
}

export function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const databaseStatus = {
    '22P02': 400,
    '23505': 409,
    '23503': 409,
    '23514': 400,
  }[error.code];
  const statusCode = error.statusCode
    || databaseStatus
    || (error.name === 'ZodError' ? 400 : 500);

  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    message: statusCode >= 500
      ? 'An unexpected server error occurred.'
      : error.message || 'The request could not be processed.',
    ...(error.name === 'ZodError' ? { details: error.issues } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
}
