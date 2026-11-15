import type { ThreadsAccount } from '../db/schema';
import * as api from './api';
import * as browser from './browser';

export function posterFor(a: ThreadsAccount) {
  return a.method === 'browser' ? browser : api;
}

export async function verifyAccount(a: ThreadsAccount) {
  return posterFor(a).verify(a);
}

export { api, browser };
