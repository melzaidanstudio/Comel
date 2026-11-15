import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { count } from 'drizzle-orm';
import { persistentSecret } from './config';
import { db } from './db';
import { account, session, user, verification } from './db/schema';

const trusted = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

export const auth = betterAuth({
  appName: 'Comel',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET || persistentSecret('.auth_secret'),
  trustedOrigins: trusted.length ? trusted : undefined,
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 hari
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        // Aplikasi pribadi: hanya akun pertama (admin) yang boleh dibuat.
        before: async () => {
          const [{ n }] = await db.select({ n: count() }).from(user);
          if (n > 0) throw new APIError('FORBIDDEN', { message: 'Pendaftaran ditutup: akun admin sudah ada.' });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export async function hasAdmin(): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(user);
  return n > 0;
}
