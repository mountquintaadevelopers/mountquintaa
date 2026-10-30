const normalizeOrigin = (value) => {
    if (!value || typeof value !== 'string') return null;
    return value.replace(/\/$/, '');
  };
  
  const resolveClientOrigin = (req) => {
    const origin = normalizeOrigin(req.get('origin'));
    if (origin) return origin;
  
    const referer = req.get('referer');
    if (!referer) return null;
  
    try {
      return normalizeOrigin(new URL(referer).origin);
    } catch {
      return null;
    }
  };
  
  const createOriginGuard = (allowedOrigins) => {
    const allowed = new Set(
      allowedOrigins.map((o) => normalizeOrigin(o)).filter(Boolean)
    );
  
    return (req, res, next) => {
      const clientOrigin = resolveClientOrigin(req);
  
      if (clientOrigin) {
        if (!allowed.has(clientOrigin)) {
          return res.status(403).json({ message: 'Access Denied' });
        }
        return next();
      }
  
      const secFetchSite = req.get('sec-fetch-site');
      if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
        return next();
      }
  
      return res.status(403).json({ message: 'Access Denied' });
    };
  };
  
  module.exports = { createOriginGuard, resolveClientOrigin, normalizeOrigin };
  