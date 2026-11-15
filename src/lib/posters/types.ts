export type ReplyTarget = {
  apiId?: string; // ID dari Threads API (bila diketahui)
  fbid?: string;
  pk?: string;
  url?: string;
  code?: string;
};
export type ReplyResult = { resultId: string | null };
