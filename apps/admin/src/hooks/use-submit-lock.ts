"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SubmitLockRunOptions {
  /**
   * Keep the lock after a successful run (e.g. a dialog that closes on
   * success: its confirm button must stay inert during the close animation).
   * Call `release()` when the surface is reused (dialog reopened).
   */
  keepOnSuccess?: boolean;
}

export interface SubmitLock {
  /**
   * Runs `fn` only if no other run is in flight. A second call while locked
   * (double click, Enter pressed twice / held, click during a dialog's close
   * animation) is swallowed and resolves to `undefined`. Errors thrown by
   * `fn` are rethrown after the lock is released.
   */
  run: <T>(fn: () => T | Promise<T>, options?: SubmitLockRunOptions) => Promise<T | undefined>;
  /** Render-time flag for `disabled` / `aria-busy`. */
  locked: boolean;
  /** Synchronous check (the ref, not render state). */
  isLocked: () => boolean;
  /** Manually releases a lock held with `keepOnSuccess`. */
  release: () => void;
}

/**
 * Synchronous in-flight lock for submit and confirm handlers (arayüz testi
 * FX-00). React Query's `isPending` only becomes visible after the mutation
 * observer notifies (next macrotask) and React re-renders, so a fast second
 * click/Enter fires a second request. The lock is a ref checked and set in
 * the same tick as the click, so the second call never reaches the network.
 *
 * Pass a promise-returning function (`mutateAsync`, not `mutate`): the lock
 * is held until it settles.
 */
export function useSubmitLock(): SubmitLock {
  const lockRef = useRef(false);
  const mountedRef = useRef(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const release = useCallback(() => {
    lockRef.current = false;
    if (mountedRef.current) setLocked(false);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => T | Promise<T>, options?: SubmitLockRunOptions): Promise<T | undefined> => {
      if (lockRef.current) return undefined;
      lockRef.current = true;
      setLocked(true);
      let ok = false;
      try {
        const result = await fn();
        ok = true;
        return result;
      } finally {
        if (!(ok && options?.keepOnSuccess)) release();
      }
    },
    [release],
  );

  const isLocked = useCallback(() => lockRef.current, []);

  return { run, locked, isLocked, release };
}

/**
 * Submit lock for a confirm button inside a dialog that the caller closes on
 * success. The lock is held after `fn` settles while the dialog is closing
 * (the button stays inert during the close animation) and released when the
 * dialog is still open after settling (failure, caller kept it open) or when
 * it is opened again. `fn` must return a promise that settles after the
 * caller's own success/failure handling (e.g. an async handler around
 * `mutateAsync`).
 */
export function useDialogSubmitLock(open: boolean): Pick<SubmitLock, "run" | "locked" | "isLocked"> {
  const { run: baseRun, locked, isLocked, release } = useSubmitLock();
  const [settled, setSettled] = useState(0);

  // Runs after the render that carries both the caller's `open` change and
  // the settle tick, so a dialog closed on success keeps the lock.
  useEffect(() => {
    if (open) release();
  }, [open, settled, release]);

  const run = useCallback(
    <T,>(fn: () => T | Promise<T>) =>
      baseRun(
        async () => {
          try {
            return await fn();
          } finally {
            setSettled((n) => n + 1);
          }
        },
        { keepOnSuccess: true },
      ),
    [baseRun],
  );

  return { run, locked, isLocked };
}
