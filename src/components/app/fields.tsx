'use client';

import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Base = { label: ReactNode; help?: ReactNode; className?: string };

export function Field({ label, help, className, children, htmlFor }: Base & { children: ReactNode; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function TextField({ value, onChange, placeholder, type = 'text', required, ...b }: Base & {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  const id = useId();
  return (
    <Field {...b} htmlFor={id}>
      <Input id={id} type={type} value={value} placeholder={placeholder} required={required}
        autoComplete={type === 'password' ? 'new-password' : undefined} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function NumberField({ value, onChange, step, min, ...b }: Base & {
  value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  const id = useId();
  return (
    <Field {...b} htmlFor={id}>
      <Input id={id} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : 0} step={step} min={min ?? 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    </Field>
  );
}

export function TextareaField({ value, onChange, placeholder, rows = 3, mono, ...b }: Base & {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean;
}) {
  const id = useId();
  return (
    <Field {...b} htmlFor={id}>
      <Textarea id={id} value={value} rows={rows} placeholder={placeholder} className={mono ? 'font-mono text-[13px]' : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField<V extends string>({ value, onChange, options, ...b }: Base & {
  value: V; onChange: (v: V) => void; options: Array<[V, string]>;
}) {
  return (
    <Field {...b}>
      <Select value={value} onValueChange={(v) => onChange(v as V)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

const NONE = '__none__';
/** Select untuk ID angka yang boleh kosong (null). */
export function IdSelectField({ value, onChange, options, noneLabel = '— default —', ...b }: Base & {
  value: number | null; onChange: (v: number | null) => void; options: Array<[number, string]>; noneLabel?: string | false;
}) {
  const items: Array<[string, string]> = [
    ...(noneLabel === false ? [] : [[NONE, noneLabel] as [string, string]]),
    ...options.map(([v, l]) => [String(v), l] as [string, string]),
  ];
  return (
    <SelectField {...b} value={value == null ? NONE : String(value)} options={items}
      onChange={(v) => onChange(v === NONE ? null : Number(v))} />
  );
}

export function SwitchField({ checked, onChange, label, help, className }: Base & { checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="leading-snug">{label}</Label>
        {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      </div>
    </div>
  );
}

export function Section({ title, children, description }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Jam aktif: '' = ikuti default, '24h', atau 'HH:MM-HH:MM'. */
export function ActiveHoursField({ value, onChange, defaultLabel, ...b }: Base & {
  value: string; onChange: (v: string) => void; defaultLabel: string;
}) {
  const mode = !value || value === 'default' ? 'default' : value === '24h' ? '24h' : 'custom';
  const [start = '06:00', end = '22:00'] = mode === 'custom' ? value.split(',')[0].split('-').map((x) => x.trim()) : [];
  return (
    <Field {...b}>
      <Select value={mode} onValueChange={(m) => onChange(m === 'default' ? '' : m === '24h' ? '24h' : `${start}-${end}`)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Ikuti default ({defaultLabel})</SelectItem>
          <SelectItem value="custom">Atur sendiri</SelectItem>
          <SelectItem value="24h">24 jam (selalu aktif)</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Mulai</span>
            <Input type="time" value={start} onChange={(e) => onChange(`${e.target.value}-${end}`)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Selesai</span>
            <Input type="time" value={end} onChange={(e) => onChange(`${start}-${e.target.value}`)} />
          </div>
        </div>
      ) : null}
    </Field>
  );
}
