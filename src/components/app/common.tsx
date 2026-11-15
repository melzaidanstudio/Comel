'use client';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ago } from '@/lib/client';
import { cn } from '@/lib/utils';
import type { ActionRow } from './types';

const tone = {
  ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-transparent',
  err: 'bg-destructive/10 text-destructive border-transparent',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-transparent',
  muted: 'bg-muted text-muted-foreground border-transparent',
};
export type Tone = keyof typeof tone;

export function Pill({ t = 'muted', children, className }: { t?: Tone; children: React.ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn('h-auto whitespace-normal text-left font-normal', tone[t], className)}>{children}</Badge>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [Tone, string]> = { sent: ['ok', 'terkirim'], failed: ['err', 'gagal'], dry_run: ['info', 'dry-run'], skipped: ['muted', 'skip'] };
  const [t, label] = map[status] || ['muted', status];
  return <Pill t={t}>{label}</Pill>;
}

export function LastStatus({ status }: { status: string }) {
  if (!status) return <Pill>belum jalan</Pill>;
  const t: Tone = /ERROR|gagal [1-9]/.test(status) ? 'err' : /^dilewati|luar jam|sibuk|lain/.test(status) ? 'warn' : 'ok';
  return <Pill t={t}>{status}</Pill>;
}

export function TagPill({ name }: { name: string }) {
  return <Pill t="info">#{name}</Pill>;
}

export function ActionsTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada aktivitas</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Waktu</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Komentar kita</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => {
          const shot = a.error?.match(/screenshot: (\S+)\)/)?.[1];
          return (
            <TableRow key={a.id} className="align-top">
              <TableCell className="whitespace-nowrap">
                {ago(a.createdAt)}
                <div className="text-xs text-muted-foreground">{a.accountName} · {a.kind === 'reply' ? 'balas komentar' : a.triggerName || 'komentar'}</div>
              </TableCell>
              <TableCell><StatusPill status={a.status} /></TableCell>
              <TableCell className="max-w-xs whitespace-normal">
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.targetUrl ? <a href={a.targetUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline">@{a.targetUser}</a> : <span>@{a.targetUser}</span>}
                  {a.metrics?.tag ? <TagPill name={a.metrics.tag} /> : null}
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{a.targetText}</p>
              </TableCell>
              <TableCell className="max-w-sm whitespace-normal">
                <p className="line-clamp-4">{a.replyText}</p>
                {a.error ? (
                  <p className="text-xs text-destructive">
                    {a.error}{' '}
                    {shot ? <a className="underline" href={`/api/screenshots/${shot}`} target="_blank" rel="noopener noreferrer">lihat screenshot</a> : null}
                  </p>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
