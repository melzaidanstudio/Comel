'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, useAction, useApi } from '@/lib/client';

export default function PersonaPage() {
  const persona = useApi<{ soul: string; memory: string }>('/persona');
  const [draftSoul, setSoul] = useState<string | null>(null);
  const [draftMemory, setMemory] = useState<string | null>(null);
  const soul = draftSoul ?? persona.data?.soul ?? '';
  const memory = draftMemory ?? persona.data?.memory ?? '';
  const { busy, run } = useAction();

  return (
    <>
      <PageHeader title="Soul & Memory" description="Kepribadian & pengetahuan AI saat menulis komentar (global; bisa di-override per akun)">
        <Button disabled={busy === 'save' || !persona.data} onClick={() => run('save', async () => {
          await api('/persona', { method: 'PUT', body: { soul, memory } });
          toast.success('soul.md & memory.md disimpan');
        })}><Save />Simpan</Button>
      </PageHeader>
      <Tabs defaultValue="soul">
        <TabsList><TabsTrigger value="soul">soul.md</TabsTrigger><TabsTrigger value="memory">memory.md</TabsTrigger></TabsList>
        <TabsContent value="soul">
          <Card className="py-4"><CardContent className="flex flex-col gap-3 px-4">
            <p className="text-sm text-muted-foreground"><b>soul.md</b> — siapa &quot;kamu&quot;: kepribadian, gaya bahasa, panjang komentar, batasan. Dipakai sebagai system prompt.</p>
            <Textarea className="min-h-[420px] font-mono text-[13px] leading-relaxed" value={soul} onChange={(e) => setSoul(e.target.value)} />
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="memory">
          <Card className="py-4"><CardContent className="flex flex-col gap-3 px-4">
            <p className="text-sm text-muted-foreground"><b>memory.md</b> — fakta yang boleh dipakai AI: info diri/bisnis, produk, lokasi, harga, FAQ.</p>
            <Textarea className="min-h-[420px] font-mono text-[13px] leading-relaxed" value={memory} onChange={(e) => setMemory(e.target.value)} />
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
