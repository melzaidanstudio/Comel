import { hasAdmin } from '@/lib/auth';

/** Apakah akun admin sudah dibuat (dipakai halaman login untuk menampilkan form setup). */
export async function GET() {
  return Response.json({ needsSetup: !(await hasAdmin()) });
}
