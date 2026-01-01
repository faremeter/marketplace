import { rateLimiter } from "hono-rate-limiter";
import type { Context } from "hono";

function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

// 5 requests per hour per IP
export const signupLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: getClientIp,
  message: { error: "Too many signup attempts, please try again later" },
});

// 10 requests per 15 minutes per IP
export const loginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: getClientIp,
  message: { error: "Too many login attempts, please try again later" },
});

// 10 requests per hour per IP
export const verifyLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: getClientIp,
  message: { error: "Too many verification attempts, please try again later" },
});

// 5 requests per day per IP
export const waitlistLimiter = rateLimiter({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  keyGenerator: getClientIp,
  message: { error: "Too many waitlist requests, please try again tomorrow" },
});

// 30 requests per hour per IP (for resource creation)
export const createResourceLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: getClientIp,
  message: { error: "Too many requests, please try again later" },
});

// 60 requests per hour per IP (for resource modifications)
export const modifyResourceLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: getClientIp,
  message: { error: "Too many requests, please try again later" },
});
