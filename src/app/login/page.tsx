'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn, signUp } from '@/lib/auth-client';
import { ComelLogo } from '@/components/app/comel-logo';

export default function LoginPage() {
  const router = useRouter();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [name, setName] = useState('Admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/setup').then((r) => r.json()).then((d) => setNeedsSetup(Boolean(d.needsSetup))).catch(() => setNeedsSetup(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = needsSetup
      ? await signUp.email({ name, email, password })
      : await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message || 'Gagal masuk');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <ComelLogo className="size-12" />
          <CardTitle className="text-xl">{needsSetup ? 'Buat akun admin' : 'Masuk ke Comel'}</CardTitle>
          <CardDescription>
            {needsSetup
              ? 'Belum ada akun. Akun pertama yang dibuat menjadi admin; pendaftaran lalu ditutup.'
              : 'Threads auto-commenter'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {needsSetup === null ? (
            <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              {needsSetup ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Nama</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" minLength={8} autoComplete={needsSetup ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
                {needsSetup ? <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p> : null}
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={busy} size="lg">
                {busy ? <Loader2 className="animate-spin" /> : null}
                {needsSetup ? 'Buat akun & masuk' : 'Masuk'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
