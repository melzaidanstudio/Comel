'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bot, Gauge, History, Inbox, LogOut, Menu, Pause, Play, Settings, Sparkles, UserRound, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { signOut } from '@/lib/auth-client';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import type { AppSettings } from '@/lib/types';

const NAV = [
  { href: '/', label: 'Dasbor', icon: Gauge },
  { href: '/triggers', label: 'Trigger', icon: Zap },
  { href: '/inbox', label: 'Inbox komentar', icon: Inbox },
  { href: '/accounts', label: 'Akun Threads', icon: UserRound },
  { href: '/providers', label: 'AI Provider', icon: Bot },
  { href: '/persona', label: 'Soul & Memory', icon: Sparkles },
  { href: '/history', label: 'Riwayat', icon: History },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate}
            className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Icon className="size-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}

function PauseButton() {
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => { api<AppSettings>('/settings').then((s) => setPaused(s.paused)).catch(() => {}); }, []);
  async function toggle() {
    try {
      const s = await api<AppSettings>('/settings', { method: 'PUT', body: { paused: !paused } });
      setPaused(s.paused);
      toast(s.paused ? 'Semua aksi otomatis di-pause' : 'Aksi otomatis dilanjutkan');
      window.dispatchEvent(new Event('comel:paused'));
    } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Button variant={paused ? 'destructive' : 'outline'} size="sm" onClick={toggle} disabled={paused === null}>
      {paused ? <Play /> : <Pause />}{paused ? 'Lanjutkan' : 'Pause semua'}
    </Button>
  );
}

export function AppShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function logout() {
    await signOut();
    router.replace('/login');
    router.refresh();
  }
  const footer = (
    <div className="mt-auto flex flex-col gap-2 border-t pt-4">
      <PauseButton />
      <Button variant="ghost" size="sm" onClick={logout}><LogOut />Keluar</Button>
      <p className="truncate px-1 text-xs text-muted-foreground">{userName}</p>
    </div>
  );
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-svh flex-col gap-6 border-r bg-background p-4 lg:flex">
        <div className="px-2 text-lg font-semibold">🐼 Comel</div>
        <Nav />
        {footer}
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="font-semibold">🐼 Comel</div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-64 flex-col gap-6 p-4">
            <SheetHeader className="p-0"><SheetTitle>🐼 Comel</SheetTitle></SheetHeader>
            <Nav onNavigate={() => setOpen(false)} />
            {footer}
          </SheetContent>
        </Sheet>
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
