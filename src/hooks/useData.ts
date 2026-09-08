/**
 * Custom React hooks for consistent data fetching and error handling
 */

import { useState, useEffect, useCallback } from 'react';
import { handleSupabaseError, type AppError } from '../lib/errorHandling';

export interface UseQueryState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  retry: () => void;
}

/**
 * Custom hook for fetching data with consistent error/loading states
 */
export function useQuery<T>(
  queryFn: () => Promise<T>,
  context: string = 'useQuery'
): UseQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const executeQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await queryFn();
      setData(result);
      setError(null);
    } catch (err) {
      const appError = handleSupabaseError(err, context);
      setError(appError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryFn, context]);

  useEffect(() => {
    executeQuery();
  }, [executeQuery]);

  return {
    data,
    loading,
    error,
    retry: executeQuery,
  };
}

export interface UseMutationState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  execute: (args?: unknown) => Promise<T | null>;
}

/**
 * Custom hook for mutations (POST, PUT, DELETE) with error handling
 */
export function useMutation<T>(
  mutationFn: (args?: unknown) => Promise<T>,
  context: string = 'useMutation'
): UseMutationState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const execute = useCallback(
    async (args?: unknown) => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await mutationFn(args);
        setData(result);
        return result;
      } catch (err) {
        const appError = handleSupabaseError(err, context);
        setError(appError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [mutationFn, context]
  );

  return {
    data,
    loading,
    error,
    execute,
  };
}

/**
 * Hook for debounced queries (e.g., search)
 */
export function useDebouncedQuery<T>(
  queryFn: (input: string) => Promise<T>,
  delay: number = 300,
  context: string = 'useDebouncedQuery'
): UseQueryState<T> & { search: (input: string) => void } {
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchTerm.trim()) {
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await queryFn(searchTerm);
        setData(result);
      } catch (err) {
        const appError = handleSupabaseError(err, context);
        setError(appError);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [searchTerm, queryFn, delay, context]);

  return {
    data,
    loading,
    error,
    search: setSearchTerm,
    retry: () => setSearchTerm(searchTerm), // Re-trigger query
  };
}

/**
 * Hook for managing loading and error states independently
 */
export interface UseLoadingState {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: AppError | null;
  setError: (error: AppError | null) => void;
  clearError: () => void;
}

export function useLoadingState(): UseLoadingState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  return {
    isLoading,
    setIsLoading,
    error,
    setError,
    clearError: () => setError(null),
  };
}

/**
 * Hook for handling async operations with proper error handling
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  onSuccess?: (data: T) => void,
  onError?: (error: AppError) => void
): { data: T | null; loading: boolean; error: AppError | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let isMounted = true;

    asyncFn()
      .then((result) => {
        if (isMounted) {
          setData(result);
          onSuccess?.(result);
        }
      })
      .catch((err) => {
        if (isMounted) {
          const appError = handleSupabaseError(err, 'useAsync');
          setError(appError);
          onError?.(appError);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [asyncFn, onError, onSuccess]);

  return { data, loading, error };
}
