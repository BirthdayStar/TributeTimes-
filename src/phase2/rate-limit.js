'use strict';

const { PHASE2_CONFIG } = require('./config');

function createGenerateRateLimiter(options = {}) {
  const maxAttempts = Number(options.maxAttempts || PHASE2_CONFIG.generateRateLimitMax || 10);
  const windowMs = Number(options.windowMs || PHASE2_CONFIG.generateRateLimitWindowMs || 60 * 60 * 1000);
  const attemptsByIp = new Map();

  return function generateRateLimiter(req, res, next) {
    const portal = String(req.body?.edition || '').trim().toLowerCase();
    const hasAuth = Boolean(String(req.headers.authorization || '').trim());

    if (hasAuth && (portal === 'radio' || portal === 'florist')) {
      return next();
    }

    const ip = getClientIp(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    const currentAttempts = (attemptsByIp.get(ip) || []).filter(timestamp => timestamp > windowStart);

    if (currentAttempts.length >= maxAttempts) {
      const retryAfterMs = Math.max(windowMs - (now - currentAttempts[0]), 1000);
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({
        error: `Generate limit reached. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`,
        rateLimit: {
          maxAttempts,
          windowMs,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        },
      });
    }

    currentAttempts.push(now);
    attemptsByIp.set(ip, currentAttempts);
    cleanupOldAttempts(attemptsByIp, windowStart);
    return next();
  };
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function cleanupOldAttempts(attemptsByIp, windowStart) {
  for (const [ip, attempts] of attemptsByIp.entries()) {
    const nextAttempts = attempts.filter(timestamp => timestamp > windowStart);
    if (nextAttempts.length) attemptsByIp.set(ip, nextAttempts);
    else attemptsByIp.delete(ip);
  }
}

module.exports = {
  createGenerateRateLimiter,
  getClientIp,
};
