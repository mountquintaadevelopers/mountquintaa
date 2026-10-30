const express = require('express');
const path = require('path');
const routes = require('./routes');
const cors = require('cors');
const helmet = require('helmet');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/error.middleware');
const { createOriginGuard } = require('./middleware/origin-guard.middleware');
const app = express();

const ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://deploy.wodo.digital',
  'https://demo.wodo.digital',
  'https://dashboard-papas.wodo.digital',
  // Public website (enquiry forms post to /v1/contact)
  'https://mountquintaa.com',
  'https://www.mountquintaa.com',
  'http://localhost'
];

// Serve uploaded files (middleware saves to src/uploads/listings)
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const originGuard = createOriginGuard(ALLOWED_ORIGINS);
const isDev = process.env.NODE_ENV === 'development';
// The WhatsApp provider calls these server-to-server with no browser Origin/Referer,
// so the origin allowlist (meant for browser clients) must not apply to them.
app.use('/v1', (req, res, next) => {
  if (req.path.startsWith('/whatsapp')) return next();
  if (isDev) return next();
  return originGuard(req, res, next);
});

if (isDev) {
  // In development allow all origins (reflect request origin) to simplify local testing
  app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
} else {
  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, false);
      }
      const normalized = origin.replace(/\/$/, '');
      const allowed = ALLOWED_ORIGINS.some(
        (o) => o.replace(/\/$/, '') === normalized
      );
      callback(null, allowed ? origin : false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
}
app.use(helmet());
app.use('/', routes);
app.use(notFound);
app.use(errorHandler);
module.exports = app;
