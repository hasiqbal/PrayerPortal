// quran-fetch Edge Function
//
// Actions (sent as JSON body `action` field):
//   "authorize"  — build Authorization Code + PKCE URL
//   "callback"   — validate state & exchange code for tokens
//   "fetch"      — fetch Quran verses (default, existing behaviour)
//
// OAuth2 env secrets: QF_CLIENT_ID, QF_CLIENT_SECRET, QF_ENV (prelive|production)
// Security rules:
//   • codeVerifier, access_token, refresh_token, client_secret are NEVER logged
//   • PKCE state is stored server-side only (in-memory Map with TTL)
//   • codeVerifier is never returned to the browser

import { corsHeaders } from '../_shared/cors.ts';

// ─── Environment & URL resolution ─────────────────────────────────────────────

interface QfConfig {
  clientId:     string;
  clientSecret: string;
  authBase:     string;
  apiBase:      string;
}

function getEnvConfig(): QfConfig | null {
  const clientId     = Deno.env.get('QF_CLIENT_ID')     || Deno.env.get('QURAN_CLIENT_ID');
  const clientSecret = Deno.env.get('QF_CLIENT_SECRET') || Deno.env.get('QURAN_CLIENT_SECRET');
  const env = (Deno.env.get('QF_ENV') ?? 'production').toLowerCase();

  if (!clientId || !clientSecret) return null;
  if (env !== 'prelive' && env !== 'production') {
    throw new Error(`Invalid QF_ENV: "${env}". Must be "prelive" or "production".`);
  }

  return {
    clientId,
    clientSecret,
    authBase: env === 'production'
      ? 'https://oauth2.quran.foundation'
      : 'https://prelive-oauth2.quran.foundation',
    apiBase: env === 'production'
      ? 'https://apis.quran.foundation'
      : 'https://apis-prelive.quran.foundation',
  };
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateRandom(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

function generateVerifier(): string {
  return generateRandom(32);
}

async function deriveChallenge(verifier: string): Promise<string> {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateOpaque(): string {
  return generateRandom(16);
}

// ─── In-memory PKCE session store ────────────────────────────────────────────

const PKCE_TTL_MS = 10 * 60 * 1000;

interface PkceSession {
  nonce:        string;
  codeVerifier: string;
  redirectUri:  string;
  expiresAt:    number;
}

const pkceStore = new Map<string, PkceSession>();

function storePkceSession(state: string, session: PkceSession): void {
  pkceStore.set(state, session);
}

function consumePkceSession(state: string): PkceSession | null {
  const session = pkceStore.get(state);
  if (!session) return null;
  pkceStore.delete(state);
  if (Date.now() > session.expiresAt) {
    console.warn('[quran-fetch/pkce] State entry expired.');
    return null;
  }
  return session;
}

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [key, session] of pkceStore) {
    if (now > session.expiresAt) pkceStore.delete(key);
  }
}

// ─── buildAuthorizationUrl ────────────────────────────────────────────────────

interface AuthUrlInput {
  redirectUri: string;
  scopes?:     string[];
}

interface AuthUrlResult {
  url:   string;
  state: string;
  nonce: string;
}

async function buildAuthorizationUrl(
  config:  QfConfig,
  options: AuthUrlInput,
): Promise<AuthUrlResult> {
  const { redirectUri, scopes = ['openid', 'content'] } = options;

  const state        = generateOpaque();
  const nonce        = generateOpaque();
  const codeVerifier = generateVerifier();
  const challenge    = await deriveChallenge(codeVerifier);

  storePkceSession(state, {
    nonce,
    codeVerifier,
    redirectUri,
    expiresAt: Date.now() + PKCE_TTL_MS,
  });

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             config.clientId,
    redirect_uri:          redirectUri,
    scope:                 scopes.join(' '),
    state,
    nonce,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });

  const url = `${config.authBase}/oauth2/auth?${params.toString()}`;
  console.log(`[quran-fetch/pkce] Authorization URL built for state=${state}`);
  purgeExpiredSessions();
  return { url, state, nonce };
}

// ─── exchangeAuthorizationCode ───────────────────────────────────────────────

interface ExchangeInput {
  code:            string;
  redirectUri:     string;
  codeVerifier:    string;
  isConfidential?: boolean;
}

interface RawTokenResponse {
  access_token:   string;
  token_type:     string;
  expires_in:     number;
  scope?:         string;
  refresh_token?: string;
  id_token?:      string;
}

async function exchangeAuthorizationCode(
  config: QfConfig,
  input:  ExchangeInput,
): Promise<RawTokenResponse> {
  const { code, redirectUri, codeVerifier, isConfidential = true } = input;

  if (!codeVerifier) {
    throw new Error('Failed to exchange authorization code for tokens: code_verifier is required.');
  }

  const bodyParams: Record<string, string> = {
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (isConfidential) {
    headers['Authorization'] = `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
  } else {
    bodyParams['client_id'] = config.clientId;
  }

  const res = await fetch(`${config.authBase}/oauth2/token`, {
    method:  'POST',
    headers,
    body:    new URLSearchParams(bodyParams).toString(),
  });

  if (!res.ok) {
    console.error(`[quran-fetch/exchange] Token exchange failed: HTTP ${res.status}`);
    throw new Error('Failed to exchange authorization code for tokens');
  }

  const json = await res.json() as RawTokenResponse;

  cachedAccessToken = json.access_token;
  if (json.refresh_token) cachedRefreshToken = json.refresh_token;
  expiresAt = Date.now() + json.expires_in * 1000;

  console.log(
    `[quran-fetch/exchange] Token exchange succeeded. ` +
    `client_type=${isConfidential ? 'confidential' : 'public'} ` +
    `expires_in=${json.expires_in}s ` +
    `has_refresh_token=${!!json.refresh_token} ` +
    `has_id_token=${!!json.id_token}`,
  );

  return {
    access_token:  json.access_token,
    token_type:    json.token_type ?? 'bearer',
    expires_in:    json.expires_in,
    scope:         json.scope,
    refresh_token: json.refresh_token,
    id_token:      json.id_token,
  };
}

// ─── handleCallback ───────────────────────────────────────────────────────────

interface CallbackInput {
  code:            string;
  state:           string;
  redirectUri:     string;
  codeVerifier?:   string;
  isConfidential?: boolean;
}

interface CallbackResult {
  nonce:           string;
  expiresIn:       number;
  tokenType:       string;
  scope?:          string;
  accessToken:     string;
  hasRefreshToken: boolean;
  hasIdToken:      boolean;
}

async function handleCallback(
  config: QfConfig,
  input:  CallbackInput,
): Promise<CallbackResult> {
  const { code, state, redirectUri, isConfidential = true } = input;

  const session = consumePkceSession(state);
  if (!session) {
    throw new Error('Invalid or expired state parameter. Possible CSRF attempt.');
  }

  if (session.redirectUri !== redirectUri) {
    throw new Error('redirect_uri mismatch. Token exchange rejected.');
  }

  const resolvedVerifier: string = input.codeVerifier || session.codeVerifier;

  const tokens = await exchangeAuthorizationCode(config, {
    code,
    redirectUri,
    codeVerifier:   resolvedVerifier,
    isConfidential,
  });

  console.log(`[quran-fetch/callback] Callback handled. state=${state}`);

  return {
    nonce:           session.nonce,
    expiresIn:       tokens.expires_in,
    tokenType:       tokens.token_type,
    scope:           tokens.scope,
    accessToken:     tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    hasIdToken:      !!tokens.id_token,
  };
}

// ─── In-memory token cache ────────────────────────────────────────────────────

let cachedAccessToken:  string | null = null;
let cachedRefreshToken: string | null = null;
let expiresAt = 0;
let inflightTokenPromise: Promise<string> | null = null;

// ─── Token fetch (client_credentials) ────────────────────────────────────────

async function fetchNewToken(config: QfConfig): Promise<string> {
  const basicAuth = btoa(`${config.clientId}:${config.clientSecret}`);

  const res = await fetch(`${config.authBase}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=content',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const json = await res.json() as {
    access_token:   string;
    expires_in:     number;
    refresh_token?: string;
    scope?:         string;
  };

  cachedAccessToken = json.access_token;
  if (json.refresh_token) cachedRefreshToken = json.refresh_token;
  expiresAt = Date.now() + json.expires_in * 1000;

  console.log(`[quran-fetch] New token obtained, expires_in=${json.expires_in}s scope="${json.scope ?? 'unknown'}"`);
  return cachedAccessToken;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(config: QfConfig): Promise<string> {
  if (!cachedRefreshToken) {
    console.log('[quran-fetch] No refresh_token cached; falling back to client_credentials.');
    return fetchNewToken(config);
  }

  const basicAuth = btoa(`${config.clientId}:${config.clientSecret}`);
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: cachedRefreshToken,
    client_id:     config.clientId,
  });

  const res = await fetch(`${config.authBase}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    console.log('[quran-fetch] Refresh failed; clearing cache and re-authenticating.');
    clearToken();
    try {
      return await fetchNewToken(config);
    } catch {
      throw new Error('Failed to refresh access token');
    }
  }

  const json = await res.json() as {
    access_token:   string;
    expires_in:     number;
    refresh_token?: string;
  };

  cachedAccessToken = json.access_token;
  if (json.refresh_token) cachedRefreshToken = json.refresh_token;
  expiresAt = Date.now() + json.expires_in * 1000;

  console.log(`[quran-fetch] Token refreshed, expires_in=${json.expires_in}s`);
  return cachedAccessToken;
}

// ─── Stampede-safe token accessor ────────────────────────────────────────────

async function getAccessToken(config: QfConfig): Promise<string> {
  if (cachedAccessToken && Date.now() < expiresAt - 30_000) {
    return cachedAccessToken;
  }

  if (!inflightTokenPromise) {
    const shouldRefresh = !cachedAccessToken || Date.now() >= expiresAt - 30_000;
    inflightTokenPromise = (
      shouldRefresh && cachedRefreshToken
        ? refreshAccessToken(config)
        : fetchNewToken(config)
    ).finally(() => {
      inflightTokenPromise = null;
    });
  }

  return inflightTokenPromise;
}

function clearToken(): void {
  cachedAccessToken  = null;
  cachedRefreshToken = null;
  expiresAt          = 0;
}

// ─── Content API fetch with 401 retry ────────────────────────────────────────

async function fetchWithRetry(url: string, config: QfConfig): Promise<Response> {
  let token = await getAccessToken(config);

  let res = await fetch(`${config.apiBase}${url}`, {
    headers: {
      'x-auth-token': token,
      'x-client-id':  config.clientId,
    },
  });

  if (res.status === 401) {
    console.warn('[quran-fetch] 401 from Content API — clearing token and refreshing once.');
    clearToken();
    try {
      token = await getAccessToken(config);
    } catch {
      throw new Error('Failed to refresh access token');
    }
    res = await fetch(`${config.apiBase}${url}`, {
      headers: {
        'x-auth-token': token,
        'x-client-id':  config.clientId,
      },
    });
  }

  return res;
}

// ─── Authenticated API client helper ─────────────────────────────────────────

interface QfApiClient {
  get(path: string, extraHeaders?: Record<string, string>): Promise<Response>;
  post(path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<Response>;
  patch(path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<Response>;
  delete(path: string, extraHeaders?: Record<string, string>): Promise<Response>;
}

function createQfApiClient(config: QfConfig, basePath: string): QfApiClient {
  function authHeaders(token: string): Record<string, string> {
    return {
      'x-auth-token': token,
      'x-client-id':  config.clientId,
    };
  }

  async function request(
    path:         string,
    init:         RequestInit            = {},
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const fullUrl = `${config.apiBase}${basePath}${path}`;

    let token = await getAccessToken(config);
    let res   = await fetch(fullUrl, {
      ...init,
      headers: {
        ...authHeaders(token),
        ...(init.body && !extraHeaders['Content-Type']
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...extraHeaders,
      },
    });

    if (res.status === 401) {
      console.warn(`[qf-client] 401 on ${basePath}${path} — clearing token and refreshing once.`);
      clearToken();
      try {
        token = await getAccessToken(config);
      } catch {
        throw new Error('Failed to refresh access token');
      }
      res = await fetch(fullUrl, {
        ...init,
        headers: {
          ...authHeaders(token),
          ...(init.body && !extraHeaders['Content-Type']
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...extraHeaders,
        },
      });
      if (res.status === 401) {
        console.error(`[qf-client] Second 401 on ${basePath}${path} after token refresh. Aborting.`);
      }
    }

    return res;
  }

  return {
    get(path, extraHeaders = {}) {
      return request(path, { method: 'GET' }, extraHeaders);
    },
    post(path, body, extraHeaders = {}) {
      return request(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }, extraHeaders);
    },
    patch(path, body, extraHeaders = {}) {
      return request(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }, extraHeaders);
    },
    delete(path, extraHeaders = {}) {
      return request(path, { method: 'DELETE' }, extraHeaders);
    },
  };
}

function createQfUserApiClient(config: QfConfig): QfApiClient {
  return createQfApiClient(config, '/auth/v1');
}

// ─── Default translation ──────────────────────────────────────────────────────

const DEFAULT_TRANSLATION_ID = 131;

// ─── Verse type ───────────────────────────────────────────────────────────────

type ApiVerse = {
  verse_key:    string;
  text_uthmani: string;
  text_indopak: string | null;
  words: Array<{
    text_uthmani:    string;
    transliteration: { text: string } | null;
  }>;
  translations: Array<{ text: string; resource_id?: number }> | undefined;
};

// (quran.com public API is no longer used for translations — they are embedded directly
//  in the QF Content API verse response via the `translations` query parameter)

// ─── HTML stripper ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')  // remove footnote superscripts
    .replace(/<[^>]+>/g, '')                         // strip remaining tags
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body   = await req.json() as Record<string, unknown>;
    const action = (body.action as string | undefined) ?? 'fetch';

    const config = getEnvConfig();
    if (!config) {
      return jsonResponse(
        {
          error:
            'Quran Foundation credentials not configured. ' +
            'Set QF_CLIENT_ID and QF_CLIENT_SECRET in Edge Function secrets.',
        },
        500,
      );
    }

    // ── Action: authorize ──────────────────────────────────────────────────────
    if (action === 'authorize') {
      const { redirectUri, scopes } = body as { redirectUri: string; scopes?: string[] };
      if (!redirectUri) {
        return jsonResponse({ error: 'redirectUri is required.' }, 400);
      }
      const result = await buildAuthorizationUrl(config, { redirectUri, scopes });
      return jsonResponse(result);
    }

    // ── Action: callback ───────────────────────────────────────────────────────
    if (action === 'callback') {
      const { code, state, redirectUri, codeVerifier, isConfidential } = body as {
        code:            string;
        state:           string;
        redirectUri:     string;
        codeVerifier?:   string;
        isConfidential?: boolean;
      };

      if (!code || !state || !redirectUri) {
        return jsonResponse({ error: 'code, state, and redirectUri are required.' }, 400);
      }

      const result = await handleCallback(config, { code, state, redirectUri, codeVerifier, isConfidential });
      return jsonResponse(result);
    }

    // ── Action: fetch (default) ────────────────────────────────────────────────
    const { surah, ayahFrom, ayahTo, translationId } = body as {
      surah:          number;
      ayahFrom?:      number;
      ayahTo?:        number;
      translationId?: number;
    };

    if (!surah || surah < 1 || surah > 114) {
      return jsonResponse({ error: 'Invalid surah number (1–114).' }, 400);
    }

    const activeTranslationId = translationId ?? DEFAULT_TRANSLATION_ID;

    console.log(
      `[quran-fetch] surah=${surah} ayahFrom=${ayahFrom ?? 'start'} ` +
      `ayahTo=${ayahTo ?? 'end'} translation=${activeTranslationId}`,
    );

    // QF API: per_page max is 50 for the verses endpoint.
    // Translations are ALSO fetched via the dedicated endpoint in parallel.
    // QF Content API: request translations embedded in each verse via the `translations` parameter.
    // The `translation_fields` param adds extra metadata but does NOT suppress translation text.
    // Translations appear in verse.translations[].text in the QF API response.
    const buildVerseParams = (page: number): string => {
      const p = new URLSearchParams({
        words:       'true',
        word_fields: 'text_uthmani,transliteration',
        fields:      'text_uthmani,text_indopak,verse_key',
        translations: String(activeTranslationId),
        per_page:    '50',
        page:        String(page),
      });
      if (ayahFrom) p.set('from', String(ayahFrom));
      if (ayahTo)   p.set('to',   String(ayahTo));
      return p.toString();
    };

    // Fetch chapter info + first verse page in parallel
    const [chapterRes, firstPageRes] = await Promise.all([
      fetchWithRetry(`/content/api/v4/chapters/${surah}?language=en`, config),
      fetchWithRetry(`/content/api/v4/verses/by_chapter/${surah}?${buildVerseParams(1)}`, config),
    ]);

    if (!chapterRes.ok) {
      const err = await chapterRes.text();
      throw new Error(`Quran chapters API error (${chapterRes.status}): ${err}`);
    }
    if (!firstPageRes.ok) {
      const err = await firstPageRes.text();
      throw new Error(`Quran verses API error (${firstPageRes.status}): ${err}`);
    }

    const [chapterData, firstPageData] = await Promise.all([
      chapterRes.json() as Promise<{
        chapter: {
          name_arabic:     string;
          name_simple:     string;
          translated_name: { name: string };
        };
      }>,
      firstPageRes.json() as Promise<{
        verses:     ApiVerse[];
        pagination: { total_pages: number; current_page: number; next_page: number | null };
      }>,
    ]);

    let verses = firstPageData.verses ?? [];
    const totalVersePages = firstPageData.pagination?.total_pages ?? 1;

    // Log how many translations were embedded in page 1
    const embeddedSample = verses[0]?.translations?.[0]?.text?.slice(0, 80) ?? 'none';
    console.log(
      `[quran-fetch] Page 1/${totalVersePages}: ${verses.length} verses. ` +
      `Embedded trans sample: "${embeddedSample}"`,
    );

    // Fetch remaining verse pages
    const extraVerseNums = totalVersePages > 1
      ? Array.from({ length: totalVersePages - 1 }, (_, i) => i + 2)
      : [];

    const extraVersePages = await Promise.all(
      extraVerseNums.map((p) =>
        fetchWithRetry(`/content/api/v4/verses/by_chapter/${surah}?${buildVerseParams(p)}`, config)
          .then((r) => r.json() as Promise<{ verses: ApiVerse[] }>)
      ),
    );

    for (const page of extraVersePages) verses = verses.concat(page.verses ?? []);

    // Translations are embedded in each verse object from the QF Content API
    const translationByKey = new Map<string, string>();
    for (const v of verses) {
      const text = v.translations?.[0]?.text;
      if (v.verse_key && text) translationByKey.set(v.verse_key, stripHtml(text));
    }

    console.log(
      `[quran-fetch] Translations loaded: ${translationByKey.size} entries. ` +
      `Total verses: ${verses.length}`,
    );

    const chapter = chapterData.chapter;

    if (!verses || verses.length === 0) {
      return jsonResponse({ error: 'No verses returned. Check ayah range.' }, 404);
    }

    // ── Build output lines ───────────────────────────────────────────────────

    const arabicLines = verses.map((v) => {
      const ayahNum = v.verse_key.split(':')[1];
      const text    = v.text_indopak || v.text_uthmani;
      return `${text} \u{FD3E}${ayahNum}\u{FD3F}`;
    });

    const translitLines = verses.map((v) => {
      const ayahNum      = v.verse_key.split(':')[1];
      const wordTranslit = v.words
        .map((w) => w.transliteration?.text ?? w.text_uthmani)
        .join(' ');
      return `${wordTranslit} (${ayahNum})`;
    });

    const translationLines = verses.map((v) => {
      const ayahNum = v.verse_key.split(':')[1];

      // Translations are pre-processed into translationByKey map (already HTML-stripped)
      const text = translationByKey.get(v.verse_key);
      if (text) {
        return `${text} (${ayahNum})`;
      }

      console.warn(
        `[quran-fetch] No translation for ${v.verse_key}. ` +
        `map_size=${translationByKey.size} raw_embedded=${v.translations?.length ?? 0}`,
      );
      return `(${ayahNum})`;
    });

    const firstKey = verses[0]?.verse_key ?? `${surah}:${ayahFrom ?? 1}`;
    const lastKey  = verses[verses.length - 1]?.verse_key;
    const isRange  = firstKey !== lastKey;
    const refRange = isRange ? `${firstKey}\u2013${lastKey?.split(':')[1]}` : firstKey;

    const result = {
      arabic:          arabicLines.join('\n'),
      transliteration: translitLines.join('\n'),
      translation:     translationLines.join('\n'),
      surahName:       chapter.translated_name?.name ?? chapter.name_simple,
      surahNameAr:     chapter.name_arabic,
      reference:       `Quran ${refRange}`,
      verseCount:      verses.length,
      translationId:   activeTranslationId,
    };

    console.log(`[quran-fetch] Done: ${verses.length} verse(s) from ${refRange}`);
    return jsonResponse(result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[quran-fetch] Error:', msg);
    return jsonResponse({ error: msg }, 500);
  }
});
