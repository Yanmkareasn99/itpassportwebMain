/**
 * Standardized error handling utilities
 * Ensures consistent error reporting and logging across the application
 */

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: number;
}

function isAppError(error: unknown): error is AppError {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && 'message' in error
    && 'timestamp' in error;
}

export class SupabaseError extends Error implements AppError {
  code: string;
  details?: unknown;
  timestamp: number;

  constructor(message: string, code: string = 'SUPABASE_ERROR', details?: unknown) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }
}

export class AIError extends Error implements AppError {
  code: string;
  details?: unknown;
  timestamp: number;

  constructor(message: string, code: string = 'AI_ERROR', details?: unknown) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }
}

export class ValidationError extends Error implements AppError {
  code: string;
  details?: unknown;
  timestamp: number;

  constructor(message: string, code: string = 'VALIDATION_ERROR', details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }
}

/**
 * Error logger with different severity levels
 */
export const errorLogger = {
  info: (message: string, data?: unknown) => {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`, data);
  },
  
  warn: (message: string, data?: unknown) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, data);
  },
  
  error: (message: string, error?: Error | unknown) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error);
    // In production, you might send these to a logging service
    reportErrorToService(message, error);
  },
  
  critical: (message: string, error?: Error | unknown) => {
    console.error(`[CRITICAL] ${new Date().toISOString()}: ${message}`, error);
    reportErrorToService(message, error, 'critical');
  },
};

/**
 * Handle Supabase errors with proper logging and user messaging
 */
export function handleSupabaseError(error: unknown, context: string): AppError {
  if (error instanceof Error) {
    // Check for specific Supabase error types
    if (error.message.includes('JWT')) {
      const err = new SupabaseError('Authentication failed. Please log in again.', 'AUTH_ERROR', error);
      errorLogger.warn(`${context}: Authentication error`, error);
      return err;
    }
    
    if (error.message.includes('not found')) {
      const err = new SupabaseError('The requested resource was not found.', 'NOT_FOUND', error);
      errorLogger.info(`${context}: Resource not found`, error);
      return err;
    }
    
    if (error.message.includes('duplicate')) {
      const err = new SupabaseError('This item already exists.', 'DUPLICATE', error);
      errorLogger.warn(`${context}: Duplicate resource`, error);
      return err;
    }
    
    // Generic Supabase error
    const err = new SupabaseError(
      'A database error occurred. Please try again.',
      'DB_ERROR',
      error
    );
    errorLogger.error(`${context}: Database error`, error);
    return err;
  }
  
  // Unknown error type
  const err = new SupabaseError('An unexpected error occurred.', 'UNKNOWN_ERROR', error);
  errorLogger.error(`${context}: Unknown error type`, error);
  return err;
}

/**
 * Handle AI/API errors with proper logging and fallback guidance
 */
export function handleAIError(error: unknown, context: string): AppError {
  if (error instanceof Error) {
    if (error.message.includes('CORS') || error.message.includes('origin')) {
      const err = new AIError('AI service is unavailable. Using local explanations.', 'CORS_ERROR', error);
      errorLogger.warn(`${context}: CORS error`, error);
      return err;
    }
    
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      const err = new AIError('AI service request timed out. Using local explanations.', 'TIMEOUT', error);
      errorLogger.warn(`${context}: Request timeout`, error);
      return err;
    }
    
    if (error.message.includes('rate')) {
      const err = new AIError('Too many requests. Please try again later.', 'RATE_LIMIT', error);
      errorLogger.warn(`${context}: Rate limit exceeded`, error);
      return err;
    }

    // Generic AI error
    const err = new AIError('AI service is temporarily unavailable.', 'SERVICE_ERROR', error);
    errorLogger.error(`${context}: AI service error`, error);
    return err;
  }
  
  const err = new AIError('An unexpected error occurred.', 'UNKNOWN_ERROR', error);
  errorLogger.error(`${context}: Unknown AI error`, error);
  return err;
}

/**
 * Validate input data and throw ValidationError if invalid
 */
export function validateInput(data: unknown, schema: Record<string, string>): asserts data is Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('Input must be an object', 'INVALID_TYPE');
  }
  
  const obj = data as Record<string, unknown>;
  for (const [key, type] of Object.entries(schema)) {
    if (type === 'required' && !(key in obj)) {
      throw new ValidationError(`Missing required field: ${key}`, 'MISSING_FIELD');
    }
  }
}

/**
 * Safe error message for user display (don't expose technical details)
 */
export function getUserMessage(error: AppError | Error): string {
  if (isAppError(error)) {
    return error.message;
  }
  
  const message = error.message || 'An unexpected error occurred';
  
  // Don't expose sensitive details to users
  if (message.includes('API') || message.includes('secret') || message.includes('key')) {
    return 'An error occurred. Please try again.';
  }
  
  return message;
}

/**
 * Report error to monitoring service (e.g., Sentry)
 */
function reportErrorToService(_message: string, _error: unknown, _severity: 'error' | 'critical' = 'error') {
  void _severity;
  if (import.meta.env.PROD) {
    // Wire this to the production monitoring service when one is configured.
  }
}

/**
 * Create async wrapper that handles errors consistently
 */
export function asyncHandler<T>(fn: () => Promise<T>) {
  return async (): Promise<[T | null, AppError | null]> => {
    try {
      const result = await fn();
      return [result, null];
    } catch (error) {
      const appError = isAppError(error) ? error : new SupabaseError('Operation failed', 'UNKNOWN', error);
      return [null, appError];
    }
  };
}
