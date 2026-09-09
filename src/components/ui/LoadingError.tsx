import { translate, translateMessage } from '../../i18n';
import { useLanguage } from '../../contexts/LanguageContext';
/**
 * Reusable error and loading display components
 */

import React from 'react';
import type { AppError } from '../../lib/errorHandling';

interface ErrorMessageProps {
  error: AppError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onRetry,
  onDismiss,
}) => {
  const { language } = useLanguage();
  if (!error) return null;

  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">{translateMessage(language, error.message)}</h3>
          {import.meta.env.DEV && error.code && (
            <p className="text-xs text-red-600 mt-1">{translate(language, 'ui.errorCode', { code: error.code })}</p>
          )}
        </div>
        <div className="ml-3 flex gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-sm font-medium text-red-600 hover:text-red-500"
            >
              {translate(language, 'ui.retry')}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-sm font-medium text-red-600 hover:text-red-500"
            >
              {translate(language, 'ui.dismiss')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
}) => {
  const { language } = useLanguage();
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <svg
        className={`${sizeClasses[size]} animate-spin text-blue-600`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message && <p className="mt-3 text-sm text-gray-600">{translateMessage(language, message)}</p>}
    </div>
  );
};

interface LoadingStateProps {
  loading: boolean;
  error: AppError | null;
  empty?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
  children?: React.ReactNode;
  loadingMessage?: string;
  emptyMessage?: string;
}

/**
 * Combined component for handling loading/error/empty states
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  loading,
  error,
  empty,
  onRetry,
  onDismiss,
  children,
  loadingMessage,
  emptyMessage = 'No data available',
}) => {
  const { language } = useLanguage();
  if (loading) {
    return <LoadingSpinner message={loadingMessage} />;
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={onRetry} onDismiss={onDismiss} />;
  }

  if (empty) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-4 text-sm text-gray-600">{translateMessage(language, emptyMessage)}</p>
      </div>
    );
  }

  return <>{children}</>;
};

interface FormErrorProps {
  error?: string;
}

/**
 * Inline field error display
 */
export const FormError: React.FC<FormErrorProps> = ({ error }) => {
  const { language } = useLanguage();
  if (!error) return null;

  return (
    <p className="mt-1 text-sm text-red-600">{translateMessage(language, error)}</p>
  );
};

interface WarningMessageProps {
  message: string;
  onDismiss?: () => void;
}

/**
 * Non-critical warning message
 */
export const WarningMessage: React.FC<WarningMessageProps> = ({
  message,
  onDismiss,
}) => {
  const { language } = useLanguage();
  return (
    <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium text-yellow-800">{translateMessage(language, message)}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-sm font-medium text-yellow-600 hover:text-yellow-500"
          >
            {translate(language, 'ui.dismiss')}
          </button>
        )}
      </div>
    </div>
  );
};

interface SuccessMessageProps {
  message: string;
  onDismiss?: () => void;
}

/**
 * Success confirmation message
 */
export const SuccessMessage: React.FC<SuccessMessageProps> = ({
  message,
  onDismiss,
}) => {
  const { language } = useLanguage();
  return (
    <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-green-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium text-green-800">{translateMessage(language, message)}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-sm font-medium text-green-600 hover:text-green-500"
          >
            {translate(language, 'ui.dismiss')}
          </button>
        )}
      </div>
    </div>
  );
};
