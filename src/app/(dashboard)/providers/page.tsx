'use client';

import { useState } from 'react';
import { FlaskConical, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/app-shell';
import { Empty, Pill } from '@/components/app/common';
import { Field, NumberField, SelectField, SwitchField, TextField } from '@/components/app/fields';
import type { ProviderJ } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useAction, useApi } from '@/lib/client';
import type { ProviderPreset } from '@/lib/llm';

type Form = { name: string; kind: 'openai' | 'anthropic'; baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number; isDefault: boolean };

export default function ProvidersPage() {
  const provs = useApi<ProviderJ[]>('/providers');
  const presets = useApi<ProviderPreset[]>('/presets');
  const { busy, run } = useAction();
  const [tests, setTests] = useState<Record<number, string>>({});
  const [dlg, setDlg] = useState<{ open: boolean; p: ProviderJ | null; key: number }>({ open: false, p: null, key: 0 });
  const openDlg = (p: ProviderJ | null) => setDlg((d) => ({ open: true, p, key: d.key + 1 }));

  return (
    <>
      <PageHeader title="AI Provider" description="9router, OpenRouter, OpenAI, Claude, Gemini, Ollama, atau endpoint OpenAI-compatible lain">
        <Button onClick={() => openDlg(null)}><Plus />Provider baru</Button>
      </PageHeader>
      <div className="flex flex-col gap-3">
        {provs.data && !provs.data.length ? <Empty>Belum ada provider</Empty> : null}
        {(provs.data || []).map((p) => (
          <Card key={p.id} className="py-4">
            <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-2"><h3 className="font-semibold">{p.name}</h3>{p.isDefault ? <Pill t="ok">default</Pill> : null}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Model: <b className="text-foreground">{p.model}</b></span>
                  <span className="break-all">URL: <b className="font-mono text-foreground">{p.baseUrl}</b></span>
                  <span>Key: <b className="text-foreground">{p.hasKey ? p.apiKeyMasked : '—'}</b></span>
                  <span>Format: <b className="text-foreground">{p.kind}</b></span>
                </div>
                {tests[p.id] ? <p className="text-sm"><Pill t="ok">OK</Pill> {tests[p.id]}</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={busy === `t${p.id}`} onClick={() => run(`t${p.id}`, async () => {
                  const r = await api<{ reply: string; ms: number }>(`/providers/${p.id}/test`, { method: 'POST' });
                  setTests((x) => ({ ...x, [p.id]: `${r.ms} ms — ${r.reply}` }));
                })}><FlaskConical />{busy === `t${p.id}` ? 'Mengetes…' : 'Tes'}</Button>
                <Button size="sm" variant="ghost" onClick={() => openDlg(p)}><Pencil />Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                  if (!confirm(`Hapus provider "${p.name}"?`)) return;
                  void run(`d${p.id}`, async () => { await api(`/providers/${p.id}`, { method: 'DELETE' }); await provs.reload(); });
                }}><Trash2 />Hapus</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <ProviderDialog key={dlg.key} state={dlg} presets={presets.data || []} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} onSaved={() => void provs.reload()} />
    </>
  );
}

function ProviderDialog({ state, presets, onOpenChange, onSaved }: {
  state: { open: boolean; p: ProviderJ | null }; presets: ProviderPreset[]; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const p = state.p;
  const fromPreset = (x?: ProviderPreset): Form => ({
    name: x ? x.label.replace(/\s*\(.*\)/, '') : '', kind: x?.kind || 'openai', baseUrl: x?.baseUrl || '', apiKey: '',
    model: x?.model || '', temperature: 0.8, maxTokens: 400, isDefault: false,
  });
  // di-mount ulang (key) setiap dibuka
  const [f, setF] = useState<Form>(() => (p
    ? { name: p.name, kind: p.kind as Form['kind'], baseUrl: p.baseUrl, apiKey: '', model: p.model, temperature: p.temperature, maxTokens: p.maxTokens, isDefault: p.isDefault }
    : fromPreset(presets[0])));
  const [preset, setPreset] = useState('0');
  const { busy, run } = useAction();
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{p ? `Edit provider: ${p.name}` : 'Provider baru'}</DialogTitle>
          <DialogDescription>Semua provider memakai format OpenAI /chat/completions, kecuali Anthropic.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!p ? (
            <Field label="Preset" className="sm:col-span-2" help={presets[Number(preset)]?.hint}>
              <Select value={preset} onValueChange={(v) => { setPreset(v); setF(fromPreset(presets[Number(v)])); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{presets.map((x, i) => <SelectItem key={x.label} value={String(i)}>{x.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          ) : null}
          <TextField label="Nama" value={f.name} onChange={set('name')} required />
          <SelectField label="Format API" value={f.kind} onChange={set('kind')} options={[['openai', 'OpenAI-compatible'], ['anthropic', 'Anthropic Messages']]} />
          <TextField className="sm:col-span-2" label="Base URL" value={f.baseUrl} onChange={set('baseUrl')} placeholder="http://localhost:20128/v1" />
          <TextField className="sm:col-span-2" type="password" label="API key" value={f.apiKey} onChange={set('apiKey')}
            placeholder={p?.hasKey ? `${p.apiKeyMasked} (tersimpan — isi untuk mengganti)` : ''} />
          <TextField label="Model" value={f.model} onChange={set('model')} placeholder="nama model" />
          <NumberField label="Temperature" value={f.temperature} step={0.1} onChange={set('temperature')} />
          <NumberField label="Max tokens" value={f.maxTokens} onChange={set('maxTokens')} />
          <SwitchField label="Jadikan default" checked={f.isDefault} onChange={set('isDefault')} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button disabled={busy === 'save' || !f.name || !f.baseUrl || !f.model} onClick={() => run('save', async () => {
            if (p) await api(`/providers/${p.id}`, { method: 'PUT', body: f });
            else await api('/providers', { method: 'POST', body: f });
            toast.success('Provider disimpan');
            onOpenChange(false);
            onSaved();
          })}>{busy === 'save' ? 'Menyimpan…' : 'Simpan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
