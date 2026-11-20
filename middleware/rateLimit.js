// A small per-client rate limit for the sign-in, registration and password
// reset forms (no extra package). The client is the address the reverse
// proxy saw: Traefik sets X-Real-Ip (and does not pass on one a client
// sends); without a proxy, the connection's address.
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.reset <= now) buckets.delete(key);
}, 60 * 1000).unref();

function clientAddress(req) {
  return String(req.get('X-Real-Ip') || req.ip || req.socket?.remoteAddress || '').trim();
}

// rateLimit('login', 10, 10 * 60 * 1000): at most 10 requests per client in 10 minutes.
module.exports = function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}|${clientAddress(req)}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset <= now) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(key, b);
    }
    if (++b.count > max) {
      const wait = Math.ceil((b.reset - now) / 60000);
      console.warn(`[rateLimit] ${name}: too many requests from ${clientAddress(req)}`);
      res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
      return res.status(429).send(`Too many attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);
    }
    next();
  };
};
