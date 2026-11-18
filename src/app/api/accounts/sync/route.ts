import { route } from '@/lib/api';
import { syncAllAccounts } from '@/lib/accounts';

/** Samakan semua akun lokal dengan daftar akun Threads di Repliz. */
export const POST = route(() => syncAllAccounts());
