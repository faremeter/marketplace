import { rateLimiter } from "hono-rate-limiter";
import type { Context, MiddlewareHandler, Next } from "hono";

const isTest = process.env.NODE_ENV === "test";

function noopLimiter() {
  return async (_c: Context, next: Next) => next();
}

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty IP strings should fall through */
function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}
/* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

function limiter(opts: {
  windowMs: number;
  limit: number;
  message: { error: string };
}): MiddlewareHandler {
  return rateLimiter({
    ...opts,
    keyGenerator: getClientIp,
  }) as MiddlewareHandler;
}

// 5 requests per hour per IP
export const signupLimiter = isTest
  ? noopLimiter()
  : limiter({
      windowMs: 60 * 60 * 1000,
      limit: 5,
      message: { error: "Too many signup attempts, please try again later" },
    });

// 10 requests per 15 minutes per IP
export const loginLimiter = isTest
  ? noopLimiter()
  : limiter({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      message: { error: "Too many login attempts, please try again later" },
    });

// 10 requests per hour per IP
export const verifyLimiter = isTest
  ? noopLimiter()
  : limiter({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      message: {
        error: "Too many verification attempts, please try again later",
      },
    });

// 5 requests per day per IP
export const waitlistLimiter = isTest
  ? noopLimiter()
  : limiter({
      windowMs: 24 * 60 * 60 * 1000,
      limit: 5,
      message: {
        error: "Too many waitlist requests, please try again tomorrow",
      },
    });

// 30 requests per hour per IP (for resource creation)
export const createResourceLimiter = isTest
  ? noopLimiter()
  : limiter({
      windowMs: 60 * 60 * 1000,
      limit: 30,
      message: { error: "Too many requests, please try again later" },
    });

// 60 requests per hour per IP (for resource modifications)
export const modifyResourceLimiter = isTest
  ? noopLimiter()
  : limiter({
      windowMs: 60 * 60 * 1000,
      limit: 60,
      message: { error: "Too many requests, please try again later" },
    });
