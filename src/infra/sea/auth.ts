import { useCallback } from 'react';
import { nanoid } from 'nanoid';
import { assertIsObject } from '../_commons';

const AUTH_STATE = 'amamo:auth_state';
const ACCESS_TOKEN = 'amamo:access_token';

export function useAuthorizeUrl() {
  const state = nanoid();
  const url = `${process.env.OAUTH_AUTHORIZE_URL}?state=${state}&response_type=code&client_id=${process.env.CLIENT_ID}`;

  const handleClick = useCallback(() => {
    window.localStorage.setItem(AUTH_STATE, state);
  }, [state]);

  return {
    url,
    handleClick,
  } as const;
}

export async function handleAuthCallback(state: string, code: string) {
  try {
    const savedState = window.localStorage.getItem(AUTH_STATE);
    if (savedState == null || savedState !== state) throw new Error('invalid state');

    // FIXME: kyを使うとiOS Safariで壊れる
    const result = await fetch(process.env.OAUTH_TOKEN_URL!, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID!,
        client_secret: process.env.CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        state,
      }),
    }).then((r) => r.json());
    assertIsObject(result);
    if (result.token_type !== 'Bearer') throw new Error('invalid token_type');
    const token = result.access_token;
    if (typeof token !== 'string') throw new Error('invalid access_token');
    window.localStorage.setItem(ACCESS_TOKEN, token);
  } finally {
    window.localStorage.removeItem(AUTH_STATE);
  }
}

export function getAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN);
}
