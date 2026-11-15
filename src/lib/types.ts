export type PostTag = { id: string; name: string; display: string; community: boolean };

export type Post = {
  code: string;
  pk: string;
  fbid: string;
  mediaId: string;
  username: string;
  userId: string;
  text: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number;
  takenAt: number; // unix detik
  isReply: boolean;
  replyToUser: string | null;
  url: string;
  mediaType?: number;
  tag: PostTag | null;
};

export type EvaluatedPost = Post & { ok: boolean; reason: string; query?: string };

export type AppSettings = {
  timezone: string;
  activeStart: string;
  activeEnd: string;
  paused: boolean;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  maxChars: number;
  skipSensitive: boolean;
};
