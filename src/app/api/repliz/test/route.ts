import { route } from '@/lib/api';
import { getMe, listThreadsAccounts } from '@/lib/repliz';

/** Tes kunci Repliz: siapa pemiliknya, paketnya, dan berapa akun Threads yang terhubung. */
export const POST = route(async () => {
  const me = await getMe();
  const accounts = me.plan === 'free' ? [] : await listThreadsAccounts().catch(() => []);
  return {
    name: me.name,
    plan: me.plan,
    expiredAt: me.expiredAt,
    isGold: me.plan === 'gold',
    threadsAccounts: accounts.length,
    connectedThreadsAccounts: accounts.filter((a) => a.isConnected).length,
  };
});
