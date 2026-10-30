const HttpError = require('../utils/http-error');

const notFound = (req, res, next) => {
  next(new HttpError(`Not Found - ${req.originalUrl}`, 404));
};

module.exports = notFound;
