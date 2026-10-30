const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode;
  let message = err.message || 'Server Error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    message = 'Resource not found';
    statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    message = 'Duplicate field value entered';
    statusCode = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map((val) => val.message).join(', ');
    statusCode = 400;
  }

  const code = statusCode || 500;
  res.status(code).json({
    success: false,
    message,
    error: message,
  });
};

module.exports = errorHandler;
