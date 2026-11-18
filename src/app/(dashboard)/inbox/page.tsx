'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Ban, RefreshCw, RotateCcw, Send, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Empty, Pill } from '@/components/app/common';
import type { AccountJ } from '@/components/app/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ago, api, useAction, useApi } from '@/lib/client';

type Status = 'pending' | 'resolved' | 'ignored';
type Item = {
  id: string; status: Status; author: string; picture: string; text: string; createdAt: string | null;
  post: { text: string; url: string }; handledByComel: boolean;
};
type InboxPage = { items: Item[]; page: number; totalPages: number; total: number };

export default function InboxPage() {
  const accs = useApi<AccountJ[]>('/accounts');
  const linked = (accs.data || []).filter((a) => a.replizAccountId);
  const [picked, setPicked] = useState<number | null>(null);
  const accountId = picked ?? linked[0]?.id ?? null;
  const [status, setStatus] = useState<Status>('pending');
  const [page, setPage] = useState(1);
  const inbox = useApi<InboxPage>(accountId ? `/inbox?accountId=${accountId}&status=${status}&page=${page}` : null, { refreshMs: 60000 });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { busy, run } = useAction();

  const suggest = (it: Item) => run(`ai${it.id}`, async () => {
    const r = await api<{ text: string; skip: boolean }>(`/inbox/${it.id}/suggest`, { method: 'POST', body: { accountId } });
    if (r.skip) toast('AI menyarankan tidak membalas komentar ini (SKIP). Anda tetap bisa menulis sendiri.');
    setDrafts((d) => ({ ...d, [it.id]: r.text }));
  });
  const reply = (it: Item) => run(`send${it.id}`, async () => {
    await api(`/inbox/${it.id}/reply`, { method: 'POST', body: { accountId, text: drafts[it.id] || '' } });
    toast.success(`Balasan terkirim ke @${it.author}`);
    setDrafts((d) => { const n = { ...d }; delete n[it.id]; return n; });
    await inbox.reload();
  });
  const setItemStatus = (it: Item, next: Status) => run(`st${it.id}`, async () => {
    await api(`/inbox/${it.id}/status`, { method: 'POST', body: { accountId, status: next } });
    toast.success(next === 'ignored' ? 'Komentar diabaikan' : 'Dikembalikan ke pending');
    await inbox.reload();
  });

  return (
    <>
      <PageHeader title="Inbox komentar" description="Komentar orang di postingan akun Anda (dari Repliz)">
        {linked.length ? (
          <Select value={accountId ? String(accountId) : ''} onValueChange={(v) => { setPicked(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Pilih akun" /></SelectTrigger>
            <SelectContent>
              {linked.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}{a.username ? ` (@${a.username})` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
        <Button variant="outline" size="icon" aria-label="Muat ulang" onClick={() => void inbox.reload()}><RefreshCw /></Button>
      </PageHeader>

      {accs.data && !linked.length ? (
        <Alert><AlertDescription>Belum ada akun dari Repliz. Tambahkan di <Link className="underline" href="/accounts">Akun Threads</Link>.</AlertDescription></Alert>
      ) : null}

      {accountId ? (
        <>
          <Tabs value={status} onValueChange={(v) => { setStatus(v as Status); setPage(1); }} className="mb-4">
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="resolved">Selesai</TabsTrigger>
              <TabsTrigger value="ignored">Diabaikan</TabsTrigger>
            </TabsList>
          </Tabs>
          {inbox.error ? <Alert className="mb-4"><AlertDescription className="text-destructive">{inbox.error}</AlertDescription></Alert> : null}
          {!inbox.data && !inbox.error ? <p className="text-sm text-muted-foreground">Memuat komentar…</p> : null}
          {inbox.data && !inbox.data.items.length ? <Empty>Tidak ada komentar {status === 'pending' ? 'yang menunggu' : 'di sini'}.</Empty> : null}

          <div className="flex flex-col gap-3">
            {(inbox.data?.items || []).map((it) => (
              <Card key={it.id} className="py-4">
                <CardContent className="flex flex-col gap-3 px-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b>@{it.author}</b>
                    <span className="text-xs text-muted-foreground">{ago(it.createdAt)}</span>
                    {it.handledByComel ? <Pill t="info">sudah diproses Comel</Pill> : null}
                  </div>
                  <p className="whitespace-pre-wrap">{it.text}</p>
                  {it.post.text || it.post.url ? (
                    <p className="line-clamp-2 border-l-2 pl-3 text-xs text-muted-foreground">
                      di postingan: {it.post.url ? <a className="underline" href={it.post.url} target="_blank" rel="noopener noreferrer">{it.post.text || 'buka'}</a> : it.post.text}
                    </p>
                  ) : null}
                  {it.status !== 'resolved' ? (
                    <>
                      <Textarea rows={2} placeholder="Tulis balasan, atau klik Saran AI…" value={drafts[it.id] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" disabled={busy === `ai${it.id}`} onClick={() => suggest(it)}>
                          <Wand2 />{busy === `ai${it.id}` ? 'Menulis…' : 'Saran AI'}
                        </Button>
                        <Button size="sm" disabled={!drafts[it.id]?.trim() || busy === `send${it.id}`} onClick={() => reply(it)}>
                          <Send />{busy === `send${it.id}` ? 'Mengirim…' : 'Kirim'}
                        </Button>
                        {it.status === 'pending' ? (
                          <Button size="sm" variant="ghost" disabled={busy === `st${it.id}`} onClick={() => setItemStatus(it, 'ignored')}><Ban />Abaikan</Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={busy === `st${it.id}`} onClick={() => setItemStatus(it, 'pending')}><RotateCcw />Kembalikan</Button>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{(drafts[it.id] || '').length}/500</span>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {inbox.data && inbox.data.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
              <span>Halaman {inbox.data.page} / {inbox.data.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= inbox.data.totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
