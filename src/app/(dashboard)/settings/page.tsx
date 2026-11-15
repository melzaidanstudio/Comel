'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { NumberField, Section, SelectField, SwitchField, TextField } from '@/components/app/fields';
import type { AppSettings } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, useAction, useApi } from '@/lib/client';

export default function SettingsPage() {
  const s = useApi<AppSettings>('/settings');
  const [draft, setF] = useState<AppSettings | null>(null);
  const { busy, run } = useAction();
  const f = draft ?? s.data;
  if (!f) return <PageHeader title="Pengaturan" description="Memuat…" />;
  const set = <K extends keyof AppSettings>(k: K) => (v: AppSettings[K]) => setF({ ...f, [k]: v });

  return (
    <>
      <PageHeader title="Pengaturan">
        <Button disabled={busy === 'save'} onClick={() => run('save', async () => {
          const { paused: _p, ...rest } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
          setF(await api<AppSettings>('/settings', { method: 'PUT', body: rest }));
          toast.success('Pengaturan disimpan');
        })}><Save />Simpan</Button>
      </PageHeader>
      <Card className="py-5"><CardContent className="flex flex-col gap-6 px-5">
        <Section title="Jam aktif default" description='Dipakai trigger & balas komentar yang memilih "Ikuti default". Mulai = selesai berarti 24 jam.'>
          <TextField type="time" label="Mulai" value={f.activeStart} onChange={set('activeStart')} />
          <TextField type="time" label="Selesai" value={f.activeEnd} onChange={set('activeEnd')} help="Boleh lewat tengah malam (mis. 20:00–02:00)" />
          <SelectField label="Zona waktu" value={f.timezone} onChange={set('timezone')}
            options={[['Asia/Jakarta', 'WIB (Asia/Jakarta)'], ['Asia/Makassar', 'WITA (Asia/Makassar)'], ['Asia/Jayapura', 'WIT (Asia/Jayapura)'], ['UTC', 'UTC']]} />
        </Section>
        <Section title="Komentar">
          <NumberField label="Panjang maksimal komentar (karakter)" value={f.maxChars} onChange={set('maxChars')} help="Threads membatasi 500" />
          <div />
          <NumberField label="Jeda antar komentar minimal (detik)" value={f.delayMinSeconds} onChange={set('delayMinSeconds')} />
          <NumberField label="Jeda antar komentar maksimal (detik)" value={f.delayMaxSeconds} onChange={set('delayMaxSeconds')} />
          <SwitchField className="sm:col-span-2" label="AI melewati postingan sensitif (duka, SARA, politik, dewasa)" checked={f.skipSensitive} onChange={set('skipSensitive')} />
        </Section>
      </CardContent></Card>
    </>
  );
}
