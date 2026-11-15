import { route } from '@/lib/api';
import { PROVIDER_PRESETS } from '@/lib/llm';

export const GET = route(() => PROVIDER_PRESETS);
