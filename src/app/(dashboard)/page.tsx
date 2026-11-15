'use client';

import Link from 'next/link';
import { Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { ActionsTable, Empty, LastStatus } from '@/components/app/common';
import { activeHoursLabel, type AccountJ, type ActionRow, type AppSettings, type LogRow, type Stats, type TriggerJ } from '@/components/app/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ago, api, num, useAction, useApi } from '@/lib/client';

export default function DashboardPage() {
  const stats = useApi<Stats>('/stats', { refreshMs: 15000 });
  const trigs = useApi<TriggerJ[]>('/triggers', { refreshMs: 15000 });
  const accs = useApi<AccountJ[]>('/accounts');
  const settings = useApi<AppSettings>('/settings');
  const acts = useApi<ActionRow[]>('/actions?limit=12', { refreshMs: 15000 });
  const logs = useApi<LogRow[]>('/logs?limit=60', { refreshMs: 15000 });
  const { busy, run } = useAction();
  const accName = (id: number) => accs.data?.find((a) => a.id === id)?.name ?? `#${id}`;
  const reloadAll = () => { void stats.reload(); void trigs.reload(); void acts.reload(); void logs.reload(); };

  const s = stats.data;
  const cards: Array<[string, number | undefined]> = [
    ['Terkirim (24 jam)', s?.sent24], ['Gagal (24 jam)', s?.failed24], ['Skip / dry-run (24 jam)', s?.skipped24],
    ['Akun aktif', s?.accounts], ['Trigger aktif', s?.triggers],
  ];

  return (
    <>
      <PageHeader title="Dasbor" description="Ringkasan 24 jam terakhir">
        <Button variant="outline" onClick={reloadAll}><RefreshCw />Muat ulang</Button>
      </PageHeader>
      {s?.paused ? (
        <Alert className="mb-4 border-amber-500/40 bg-amber-500/10">
          <AlertDescription>⏸ Aplikasi sedang di-PAUSE. Penjadwal tidak akan mengirim komentar sampai dilanjutkan.</AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, n]) => (
          <Card key={label} className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-2xl font-semibold tabular-nums">{n === undefined ? '…' : num(n)}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Trigger</CardTitle></CardHeader>
        <CardContent>
          {!trigs.data?.length ? (
            <Empty>Belum ada trigger. <Link href="/triggers" className="underline">Buat trigger</Link></Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Nama</TableHead><TableHead>Akun</TableHead><TableHead>Jadwal</TableHead><TableHead>Terakhir</TableHead><TableHead>Berikutnya</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {trigs.data.map((t) => (
                  <TableRow key={t.id} className="align-top">
                    <TableCell className="font-medium">{t.name}{!t.enabled ? <span className="ml-2 text-xs text-muted-foreground">(nonaktif)</span> : null}{t.dryRun ? <span className="ml-2 text-xs text-sky-600">dry-run</span> : null}</TableCell>
                    <TableCell>{accName(t.accountId)}</TableCell>
                    <TableCell>{t.actionsPerRun}× / {t.intervalMinutes} mnt<div className="text-xs text-muted-foreground">{activeHoursLabel(t.activeHours, settings.data)}</div></TableCell>
                    <TableCell className="max-w-56 whitespace-normal"><LastStatus status={t.lastStatus} /><div className="text-xs text-muted-foreground">{ago(t.lastRunAt)}</div></TableCell>
                    <TableCell>{t.enabled ? ago(t.nextRunAt) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={busy === `run${t.id}`}
                        onClick={() => run(`run${t.id}`, async () => {
                          const r = await api<{ status: string }>(`/triggers/${t.id}/run`, { method: 'POST' });
                          toast.success(`Selesai: ${r.status}`); reloadAll();
                        })}>
                        <Play />{busy === `run${t.id}` ? 'Berjalan…' : 'Jalankan'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Aktivitas terbaru</CardTitle></CardHeader>
        <CardContent><ActionsTable rows={acts.data || []} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Log sistem</CardTitle></CardHeader>
        <CardContent className="font-mono text-xs">
          {(logs.data || []).map((l) => (
            <div key={l.id} className="border-b border-dashed py-1 break-words last:border-0">
              <span className="text-muted-foreground">{new Date(l.ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })}</span>{' '}
              <span className={l.level === 'error' ? 'text-destructive' : l.level === 'warn' ? 'text-amber-600' : 'text-muted-foreground'}>{l.level.toUpperCase()}</span>{' '}
              <b>{l.source}</b> {l.message}
            </div>
          ))}
          {!logs.data?.length ? <p className="py-6 text-center text-muted-foreground">Belum ada log</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
