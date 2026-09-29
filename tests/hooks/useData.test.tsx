import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAsync,
  useDebouncedQuery,
  useLoadingState,
  useMutation,
  useQuery,
} from '../../src/hooks/useData';

describe('useData hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('loads data and retries a query', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce('first result')
      .mockResolvedValueOnce('second result');
    const { result } = renderHook(() => useQuery(query, 'test query'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('first result'));
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.data).toBe('second result');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('exposes a normalized query error', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database offline'));
    const { result } = renderHook(() => useQuery(query, 'failed query'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toMatchObject({ code: 'DB_ERROR' });
  });

  it('executes successful and failed mutations', async () => {
    const mutation = vi.fn().mockResolvedValue({ id: 'saved' });
    const { result } = renderHook(() => useMutation(mutation, 'save item'));

    let value: unknown;
    await act(async () => {
      value = await result.current.execute({ name: 'Item' });
    });

    expect(value).toEqual({ id: 'saved' });
    expect(result.current.data).toEqual({ id: 'saved' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mutation).toHaveBeenCalledWith({ name: 'Item' });

    mutation.mockRejectedValueOnce(new Error('save failed'));
    await act(async () => {
      value = await result.current.execute();
    });
    expect(value).toBeNull();
    expect(result.current.error).toMatchObject({ code: 'DB_ERROR' });
  });

  it('debounces searches and clears data for blank input', async () => {
    const query = vi.fn().mockResolvedValue(['result']);
    const { result } = renderHook(() => useDebouncedQuery(query, 5, 'search'));

    act(() => result.current.search('network'));
    await waitFor(() => expect(result.current.data).toEqual(['result']));
    expect(query).toHaveBeenCalledWith('network');

    act(() => result.current.search('   '));
    await waitFor(() => expect(result.current.data).toBeNull());
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('exposes errors from a debounced search', async () => {
    const query = vi.fn().mockRejectedValue(new Error('search failed'));
    const { result } = renderHook(() => useDebouncedQuery(query, 5, 'search'));

    act(() => result.current.search('security'));
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'DB_ERROR' }));
    expect(result.current.loading).toBe(false);
  });

  it('manages independent loading and error state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setIsLoading(true);
      result.current.setError({
        code: 'TEST',
        message: 'Problem',
        timestamp: 1,
      });
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error?.message).toBe('Problem');

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('runs success and error callbacks for async work', async () => {
    const onSuccess = vi.fn();
    const success = vi.fn().mockResolvedValue('loaded');
    const successHook = renderHook(() => useAsync(success, onSuccess));

    await waitFor(() => expect(successHook.result.current.loading).toBe(false));
    expect(successHook.result.current.data).toBe('loaded');
    expect(onSuccess).toHaveBeenCalledWith('loaded');
    successHook.unmount();

    const onError = vi.fn();
    const failure = vi.fn().mockRejectedValue(new Error('load failed'));
    const failureHook = renderHook(() => useAsync(failure, undefined, onError));

    await waitFor(() => expect(failureHook.result.current.loading).toBe(false));
    expect(failureHook.result.current.error).toMatchObject({ code: 'DB_ERROR' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'DB_ERROR' }));
  });

  it('ignores async completion after unmounting', async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>(done => {
      resolve = done;
    });
    const onSuccess = vi.fn();
    const { unmount } = renderHook(() => useAsync(() => pending, onSuccess));

    unmount();
    await act(async () => {
      resolve('late result');
      await pending;
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
