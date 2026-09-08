/**
 * Rate limiting utilities for AI requests and other API calls
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetTime: number;
}

// In-memory store for rate limits (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const AI_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 10 requests per hour
};

/**
 * Check if request is allowed based on rate limit
 * @returns boolean indicating if request is allowed
 */
export function checkRateLimit(userId: string, config: RateLimitConfig = AI_CONFIG): RateLimitStatus {
  const key = `user:${userId}`;
  const now = Date.now();
  
  let bucket = rateLimitStore.get(key);
  
  // Initialize or reset bucket if window has passed
  if (!bucket || now >= bucket.resetTime) {
    bucket = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, bucket);
  }
  
  return {
    remaining: Math.max(0, config.maxRequests - bucket.count),
    total: config.maxRequests,
    resetTime: bucket.resetTime,
  };
}

/**
 * Increment request count for user
 * @returns true if request was allowed, false if rate limited
 */
export function recordRequest(userId: string, config: RateLimitConfig = AI_CONFIG): boolean {
  const key = `user:${userId}`;
  const now = Date.now();
  
  let bucket = rateLimitStore.get(key);
  
  // Initialize if needed
  if (!bucket || now >= bucket.resetTime) {
    bucket = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, bucket);
    return true;
  }
  
  // Check if limit exceeded
  if (bucket.count >= config.maxRequests) {
    return false;
  }
  
  // Increment counter
  bucket.count++;
  return true;
}

/**
 * Get current rate limit status for user
 */
export function getRateLimitStatus(userId: string, config: RateLimitConfig = AI_CONFIG): RateLimitStatus {
  return checkRateLimit(userId, config);
}

/**
 * Reset rate limit for user (admin only)
 */
export function resetRateLimit(userId: string): void {
  const key = `user:${userId}`;
  rateLimitStore.delete(key);
}

/**
 * Clean up expired rate limit buckets
 * Call this periodically (e.g., every hour)
 */
export function cleanupExpiredBuckets(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now >= bucket.resetTime) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

/**
 * Get all rate limit statistics (admin only)
 */
export function getStatistics(): {
  totalUsers: number;
  activeBuckets: number;
} {
  return {
    totalUsers: rateLimitStore.size,
    activeBuckets: Array.from(rateLimitStore.values()).filter(
      b => Date.now() < b.resetTime
    ).length,
  };
}

/**
 * Middleware-like function for Express or similar
 * Usage: if (!isAllowed(req.user.id)) { return res.status(429).send(...); }
 */
export function isAllowed(userId: string, config: RateLimitConfig = AI_CONFIG): boolean {
  const status = checkRateLimit(userId, config);
  
  if (status.remaining <= 0) {
    return false;
  }
  
  return recordRequest(userId, config);
}

/**
 * Check if origin is allowed for production
 */
const ALLOWED_ORIGINS: string[] = import.meta.env.PROD
  ? (import.meta.env.VITE_ALLOWED_ORIGINS || 'https://itpassportweb-app.vercel.app').split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.some(allowed => origin === allowed.trim());
}

/**
 * Get formatted rate limit error message
 */
export function getRateLimitErrorMessage(status: RateLimitStatus): string {
  const resetDate = new Date(status.resetTime);
  const timeUntilReset = Math.ceil((status.resetTime - Date.now()) / 1000 / 60); // minutes
  
  return `Rate limit exceeded. You have used all ${status.total} requests. Please try again in ${timeUntilReset} minutes (reset at ${resetDate.toLocaleTimeString()}).`;
}
