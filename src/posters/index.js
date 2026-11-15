import * as api from './api.js';
import * as browser from './browser.js';

export function posterFor(account) {
  return account.method === 'browser' ? browser : api;
}

export async function verifyAccount(account) {
  return posterFor(account).verify(account);
}

export { api, browser };
