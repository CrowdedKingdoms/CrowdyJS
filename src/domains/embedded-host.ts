/**
 * The embedded-host bridge: how a game framed by the Crowdy Games SHELL signs in.
 *
 * A game published to Crowdy Games (`client.hosting`, the-construct's `npm run
 * publish`) is reached at `https://<games host>/<slug>/`, which is a first-party
 * shell page, and executes inside that page's iframe on its own origin,
 * `https://<slug>.<content host>`. Two things about that arrangement change hosted
 * sign-in, and this module is the whole of the change:
 *
 *   1. The game cannot navigate the tab. Its iframe has no `allow-top-navigation`
 *      (a game that could send the player to a lookalike sign-in page would have the
 *      phishing surface the shell exists to remove), and Studio refuses to be framed.
 *      So `portal.signIn` asks the SHELL to navigate -- `crowdyjs:navigate` -- and
 *      the shell honours exactly one destination: the tier's Studio `/authorize`.
 *
 *   2. The redirect URI is the SHELL's page, not the iframe's. Studio sends the code
 *      back to `https://<games host>/<slug>/` (the app's registered redirect URI, which
 *      `claimGameHosting` registered); the shell moves `?code=&state=` onto the iframe's
 *      `src` and strips it from its own address bar; the game's
 *      `handleSignInCallback()` then reads its own `location.search` exactly as it does
 *      when self-hosted. The shell tells the game which return URL to use in
 *      `crowdyjs:host-hello`.
 *
 * WHAT DOES NOT CHANGE. The PKCE pair is generated here, in the game's origin, and the
 * verifier stays in the game origin's sessionStorage. The shell relays a code it cannot
 * spend. The app token is exchanged and stored by the game as before.
 *
 * WHY TRUSTING THE PARENT IS SAFE. The bridge accepts `crowdyjs:host-hello` only from
 * `window.parent`. When the game is served by the Crowdy Games content edge, its
 * `frame-ancestors` names the tier's games host and nothing else, so the parent IS the
 * shell. A self-hosted game framed by a hostile page could be told a hostile
 * `returnUrl` -- and Studio would refuse it, because it is not one of the app's
 * registered redirect URIs; and even a code delivered to a registered-but-wrong page
 * is useless without the verifier in this origin. The bridge also refuses a
 * `returnUrl` whose origin is not https (or the parent's own origin, for a local dev
 * shell), so the failure is loud rather than a silent detour.
 *
 * The message shapes mirror Crowdy-Games `shell/src/protocol.ts` (version 1).
 */

export const EMBEDDED_HOST_PROTOCOL_VERSION = 1;

export interface HostHelloMessage {
  type: 'crowdyjs:host-hello';
  version: number;
  /** The URL hosted sign-in must return to: the shell's page for this game. */
  returnUrl: string;
  /** The Studio origin the shell will navigate to for `/authorize`. */
  authorizeOrigin: string;
  /** The slug the shell is showing. */
  slug: string;
}

export interface HostHelloRequestMessage {
  type: 'crowdyjs:host-hello-request';
  version: number;
}

export interface NavigateMessage {
  type: 'crowdyjs:navigate';
  version: number;
  url: string;
}

/** What the game learned from the shell. */
export interface EmbeddedHostInfo {
  /** The shell's origin (`event.origin` of the hello) -- the only target navigate posts to. */
  hostOrigin: string;
  returnUrl: string;
  authorizeOrigin: string;
  slug: string;
}

/** The DOM surface the bridge needs, narrow so tests can hand it a fake. */
export interface EmbeddedWindow {
  parent: unknown;
  addEventListener(type: 'message', listener: (event: EmbeddedMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: EmbeddedMessageEvent) => void): void;
  location?: { origin?: string };
}

export interface EmbeddedMessageEvent {
  data: unknown;
  origin: string;
  source: unknown;
}

export interface ParentWindow {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface EmbeddedHostOptions {
  /** How long `hello()` waits for the shell before deciding the game is not framed by one. */
  helloTimeoutMs?: number;
}

const DEFAULT_HELLO_TIMEOUT_MS = 1500;

function isHostHello(data: unknown): data is HostHelloMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Partial<HostHelloMessage>;
  return (
    d.type === 'crowdyjs:host-hello' &&
    typeof d.returnUrl === 'string' &&
    typeof d.authorizeOrigin === 'string' &&
    typeof d.slug === 'string'
  );
}

/**
 * Detects and talks to a Crowdy Games shell framing this page. Constructed once by
 * `createCrowdyClient` (see `CrowdyClientConfig.embeddedHost`); `portal.signIn`
 * consults it.
 */
export class EmbeddedHost {
  private info: EmbeddedHostInfo | null = null;
  private pending: Promise<EmbeddedHostInfo | null> | null = null;
  private readonly listener: (event: EmbeddedMessageEvent) => void;
  private readonly helloTimeoutMs: number;

  constructor(
    private readonly win: EmbeddedWindow | null = defaultWindow(),
    options: EmbeddedHostOptions = {},
  ) {
    this.helloTimeoutMs = options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS;
    this.listener = (event) => this.onMessage(event);
    if (this.isFramed()) {
      this.win!.addEventListener('message', this.listener);
    }
  }

  /** True when this page is inside another (any) frame. Not the same as "framed by a shell". */
  isFramed(): boolean {
    const w = this.win;
    if (!w) return false;
    try {
      return w.parent !== null && w.parent !== undefined && w.parent !== (w as unknown);
    } catch {
      return false;
    }
  }

  /** The shell's facts, once a hello has arrived; null before that or when not framed. */
  current(): EmbeddedHostInfo | null {
    return this.info;
  }

  /**
   * Ask the parent to identify itself and wait (bounded) for a hello. Resolves null
   * when this page is not framed, or the parent never answers -- which is how a game
   * that is simply embedded in somebody's blog behaves like a top-level page.
   */
  hello(timeoutMs = this.helloTimeoutMs): Promise<EmbeddedHostInfo | null> {
    if (!this.isFramed()) return Promise.resolve(null);
    if (this.info) return Promise.resolve(this.info);
    if (this.pending) return this.pending;
    this.pending = new Promise<EmbeddedHostInfo | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending = null;
        resolve(this.info);
      }, timeoutMs);
      const check = () => {
        if (this.info) {
          clearTimeout(timer);
          this.pending = null;
          resolve(this.info);
        }
      };
      this.onHello = check;
      const request: HostHelloRequestMessage = {
        type: 'crowdyjs:host-hello-request',
        version: EMBEDDED_HOST_PROTOCOL_VERSION,
      };
      // '*': the request carries nothing and the parent's origin is not yet known.
      (this.win!.parent as ParentWindow).postMessage(request, '*');
    });
    return this.pending;
  }

  /**
   * Ask the shell to take the tab to `url`. The shell honours only its tier's Studio
   * `/authorize` with a redirect_uri of its own page; anything else is dropped there.
   */
  navigate(url: string): void {
    if (!this.info) throw new Error('embedded host: no shell has said hello; call hello() first');
    const message: NavigateMessage = {
      type: 'crowdyjs:navigate',
      version: EMBEDDED_HOST_PROTOCOL_VERSION,
      url,
    };
    (this.win!.parent as ParentWindow).postMessage(message, this.info.hostOrigin);
  }

  close(): void {
    this.win?.removeEventListener('message', this.listener);
  }

  private onHello: (() => void) | null = null;

  private onMessage(event: EmbeddedMessageEvent): void {
    if (!this.win || event.source !== this.win.parent) return;
    if (!isHostHello(event.data)) return;
    if (!this.acceptableReturnUrl(event.data.returnUrl, event.origin)) return;
    let authorizeOrigin: string;
    try {
      authorizeOrigin = new URL(event.data.authorizeOrigin).origin;
    } catch {
      return;
    }
    this.info = {
      hostOrigin: event.origin,
      returnUrl: event.data.returnUrl,
      authorizeOrigin,
      slug: event.data.slug,
    };
    this.onHello?.();
  }

  /**
   * The return URL must be a page ON THE SHELL'S OWN ORIGIN: the shell is the page
   * that will receive the code, so a hello naming anywhere else is malformed (or
   * hostile) and is ignored rather than acted on.
   */
  private acceptableReturnUrl(returnUrl: string, hostOrigin: string): boolean {
    try {
      const u = new URL(returnUrl);
      return u.origin === hostOrigin && (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    } catch {
      return false;
    }
  }
}

function defaultWindow(): EmbeddedWindow | null {
  const g = globalThis as { window?: EmbeddedWindow };
  return g.window ?? null;
}
