import "server-only";

// Garmin SSO sign-in with MFA support. The @flow-js/garmin-connect library's
// own login can't do MFA (its axios client keeps no cookies, and the MFA
// verify POST is validated against the SSO session cookies), so we run the
// SSO dance ourselves — mirroring garth, the reference implementation — and
// hand the resulting ticket back to the library for the OAuth token exchange.

const SSO_ORIGIN = "https://sso.garmin.com";
const SSO_EMBED = `${SSO_ORIGIN}/sso/embed`;
const SIGNIN_URL = `${SSO_ORIGIN}/sso/signin`;
const MFA_URL = `${SSO_ORIGIN}/sso/verifyMFA/loginEnterMfaCode`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/;
const TICKET_RE = /ticket=([^"']+)["']/;
const TITLE_RE = /<title>([^<]*)<\/title>/;
const LOCKED_RE = /var status\s*=\s*"([^"]*)"/;

export class GarminSsoError extends Error {}

/** Non-2xx from the SSO endpoints, with the status attached for mapping. */
export class GarminSsoHttpError extends GarminSsoError {
  constructor(public status: number) {
    super(`Garmin SSO request failed (${status})`);
  }
}

export type CookieJar = Record<string, string>;

/** SSO state carried between the password step and the MFA-code step. */
export interface MfaPendingState {
  jar: CookieJar;
  csrf: string;
}

export type SsoLoginResult =
  | { status: "ticket"; ticket: string }
  | { status: "mfa"; state: MfaPendingState };

function storeCookies(jar: CookieJar, res: Response): void {
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** fetch with a cookie jar and manual redirect-following (fetch drops cookies otherwise). */
async function jarFetch(
  jar: CookieJar,
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<string> {
  let current = url;
  let method = init.method ?? "GET";
  let body = init.body;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, {
      method,
      body,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookieHeader(jar),
        ...(hop === 0 ? init.headers : {}),
      },
    });
    storeCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new GarminSsoError(`Garmin SSO redirect without location (${res.status})`);
      current = new URL(loc, current).toString();
      method = "GET";
      body = undefined;
      continue;
    }
    if (!res.ok) throw new GarminSsoHttpError(res.status);
    return res.text();
  }
  throw new GarminSsoError("Garmin SSO redirect loop");
}

function signinParams(): URLSearchParams {
  return new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    clientId: "GarminConnect",
    locale: "en",
    gauthHost: SSO_EMBED,
    service: SSO_EMBED,
    source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED,
    redirectAfterAccountCreationUrl: SSO_EMBED,
  });
}

function checkForFailures(html: string): void {
  const locked = LOCKED_RE.exec(html);
  if (locked?.[1]) {
    throw new GarminSsoError("Garmin reports this account as locked — unlock it at connect.garmin.com first.");
  }
  const title = TITLE_RE.exec(html)?.[1] ?? "";
  if (title.includes("Update Phone Number")) {
    throw new GarminSsoError("Garmin is asking you to update your phone number — sign in at connect.garmin.com once, then retry.");
  }
}

function extractTicket(html: string): string | null {
  return TICKET_RE.exec(html)?.[1] ?? null;
}

/** Step 1+2+3: credentials → ticket, or an MFA challenge to continue via ssoSubmitMfa. */
export async function ssoLogin(username: string, password: string): Promise<SsoLoginResult> {
  const jar: CookieJar = {};

  await jarFetch(
    jar,
    `${SSO_EMBED}?${new URLSearchParams({ clientId: "GarminConnect", locale: "en", service: "https://connect.garmin.com/modern" })}`,
  );

  const widgetUrl = `${SIGNIN_URL}?${new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    locale: "en",
    gauthHost: SSO_EMBED,
  })}`;
  const widgetHtml = await jarFetch(jar, widgetUrl);
  const csrf = CSRF_RE.exec(widgetHtml)?.[1];
  if (!csrf) throw new GarminSsoError("Garmin SSO changed — CSRF token not found on the sign-in page.");

  const postUrl = `${SIGNIN_URL}?${signinParams()}`;
  let loginHtml: string;
  try {
    loginHtml = await jarFetch(jar, postUrl, {
      method: "POST",
      body: new URLSearchParams({ username, password, embed: "true", _csrf: csrf }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: SSO_ORIGIN,
        Referer: widgetUrl,
        Dnt: "1",
      },
    });
  } catch (err) {
    // Garmin answers the credential POST itself with 401/403 on a bad password.
    if (err instanceof GarminSsoHttpError && (err.status === 401 || err.status === 403)) {
      throw new GarminSsoError("Garmin sign-in failed — check your email and password.");
    }
    if (err instanceof GarminSsoHttpError && err.status === 429) {
      throw new GarminSsoError("Garmin is rate-limiting sign-ins — wait a few minutes and try again.");
    }
    throw err;
  }

  checkForFailures(loginHtml);

  const ticket = extractTicket(loginHtml);
  if (ticket) return { status: "ticket", ticket };

  const title = TITLE_RE.exec(loginHtml)?.[1] ?? "";
  if (title.includes("MFA") || loginHtml.includes("verifyMFA")) {
    const mfaCsrf = CSRF_RE.exec(loginHtml)?.[1];
    if (!mfaCsrf) throw new GarminSsoError("Garmin asked for MFA but no CSRF token was found.");
    return { status: "mfa", state: { jar, csrf: mfaCsrf } };
  }

  throw new GarminSsoError("Garmin sign-in failed — check your email and password.");
}

/** MFA step: submit the emailed/app code within the pending SSO session. */
export async function ssoSubmitMfa(state: MfaPendingState, code: string): Promise<string> {
  const html = await jarFetch(state.jar, `${MFA_URL}?${signinParams()}`, {
    method: "POST",
    body: new URLSearchParams({
      "mfa-code": code.trim(),
      embed: "true",
      _csrf: state.csrf,
      fromPage: "setupEnterMfaCode",
    }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: SSO_ORIGIN,
      Referer: `${SIGNIN_URL}?${signinParams()}`,
      Dnt: "1",
    },
  });

  checkForFailures(html);
  const ticket = extractTicket(html);
  if (!ticket) {
    // A fresh CSRF on the response usually means "wrong code, try again".
    const retryCsrf = CSRF_RE.exec(html)?.[1];
    if (retryCsrf) state.csrf = retryCsrf;
    throw new GarminSsoError("Garmin rejected that code — check it and try again.");
  }
  return ticket;
}
