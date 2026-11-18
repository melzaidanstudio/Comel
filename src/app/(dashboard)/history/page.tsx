'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/app/app-shell';
import { ActionsTable } from '@/components/app/common';
import type { ActionRow } from '@/components/app/types';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApi } from '@/lib/client';

export default function HistoryPage() {
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const qs = new URLSearchParams({ limit: '300' });
  if (status !== 'all') qs.set('status', status);
  if (kind !== 'all') qs.set('kind', kind);
  const rows = useApi<ActionRow[]>(`/actions?${qs}`);

  return (
    <>
      <PageHeader title="Riwayat" description="Semua komentar & balasan yang dibuat">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem><SelectItem value="sent">Terkirim</SelectItem>
            <SelectItem value="failed">Gagal</SelectItem><SelectItem value="dry_run">Dry-run</SelectItem><SelectItem value="skipped">Skip</SelectItem><SelectItem value="uncertain">Tidak pasti</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem><SelectItem value="comment">Komentar (trigger)</SelectItem><SelectItem value="reply">Balas komentar</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>
      <Card className="py-4"><CardContent className="px-4"><ActionsTable rows={rows.data || []} /></CardContent></Card>
    </>
  );
}
