import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Shared-secret auth for the public intake endpoints.
 *
 * These routes are called server-to-server by the public website's PHP handler,
 * never by a browser, so a static key in the `x-api-key` header is sufficient.
 *
 * Fails closed: if PUBLIC_INTAKE_API_KEY is not configured the endpoint is
 * unavailable rather than open. Do not add a fallback default value here.
 */
const publicApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.PUBLIC_INTAKE_API_KEY;

  if (!expected || !expected.trim()) {
    console.error('[publicApiKey] PUBLIC_INTAKE_API_KEY is not configured; rejecting request.');
    res.status(503).json({ success: false, message: 'Public intake is not configured.' });
    return;
  }

  const headerValue = req.headers['x-api-key'];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof provided !== 'string' || provided.length === 0) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  // timingSafeEqual throws on length mismatch, so compare lengths first.
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);

  if (!matches) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  next();
};

export default publicApiKey;
