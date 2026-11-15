'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/** Tanggal dari JSON berupa string. */
export type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.replace(new URL('/login', window.location.origin));
    throw new Error('Belum login');
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || (data as { message?: string }).message || `HTTP ${res.status}`);
  return data as T;
}

/** Ambil data dari API; reload() untuk muat ulang; refreshMs untuk auto-refresh. */
export function useApi<T>(path: string | null, { refreshMs }: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback((p: string) => api<T>(p)
    .then((d) => { setData(d); setError(null); })
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false)), []);

  const reload = useCallback(async () => { if (path) await load(path); }, [path, load]);

  useEffect(() => {
    if (!path) return;
    void load(path);
    if (!refreshMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(path); }, refreshMs);
    return () => clearInterval(t);
  }, [path, refreshMs, load]);

  return { data, error, loading, reload, setData };
}

/** Jalankan aksi async dengan status sibuk & toast error otomatis. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <R,>(key: string, fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(key);
    try { return await fn(); } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    } finally { setBusy(null); }
  }, []);
  return { busy, run };
}

export function ago(ts: string | number | null | undefined): string {
  if (!ts) return '—';
  const t = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 0) return `dalam ${fmtDur(-s)}`;
  if (s < 60) return 'baru saja';
  return `${fmtDur(s)} lalu`;
}

function fmtDur(s: number) {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} mnt`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} jam`;
  return `${Math.round(s / 86400)} hari`;
}

export const num = (n: number | null | undefined) => Number(n || 0).toLocaleString('id-ID');
