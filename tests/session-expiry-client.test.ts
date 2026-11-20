import vm from 'vm';
import { attachSessionExpiryToResponse, renderSessionExpiryClientScript, SESSION_EXPIRY_HEADER } from '../src/services/adminSession.service';

function createBrowser(pathname: string, currentTime = 1_000_000, expiresAt = currentTime + 30 * 60 * 1000) {
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const listeners: Record<string, () => void> = {};
  const location = {
    pathname,
    origin: 'https://pmycfootball.in.th',
    href: `https://pmycfootball.in.th${pathname}`,
    reload: jest.fn(),
    replace: jest.fn()
  };
  const response = {
    status: 200,
    ok: true,
    redirected: false,
    url: '',
    headers: { get: jest.fn((name: string) => name === SESSION_EXPIRY_HEADER ? String(expiresAt) : null) },
    clone: () => ({ json: async () => ({}) })
  };
  const window: any = {
    location,
    fetch: jest.fn(async () => response),
    setTimeout: (callback: () => void, delay: number) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout: jest.fn(),
    addEventListener: jest.fn((name: string, callback: () => void) => { listeners[name] = callback; })
  };
  const meta = { getAttribute: (name: string) => name === 'content' ? String(expiresAt) : null };
  const document: any = {
    hidden: false,
    querySelector: jest.fn(() => meta),
    addEventListener: jest.fn((name: string, callback: () => void) => { listeners[name] = callback; })
  };
  class FakeDate extends Date {
    static now() { return currentTime; }
  }
  class FakeXhr { send() {} }
  (FakeXhr.prototype as any).send = jest.fn();
  const source = renderSessionExpiryClientScript().replace(/^<script>|<\/script>$/g, '');
  vm.runInNewContext(source, { window, document, Date: FakeDate, URL, XMLHttpRequest: FakeXhr, Number, Math, String, JSON });
  return { window, location, response, timers, listeners, setCurrentTime: (value: number) => { currentTime = value; } };
}

describe('session expiry client timer', () => {
  test('attaches the exact server deadline to the protected HTML response and expiry header', () => {
    const response: any = {
      setHeader: jest.fn(),
      send: jest.fn((body: string) => body)
    };
    attachSessionExpiryToResponse(response, 1_234_567.9);
    const html = response.send('<html><head></head><body>protected</body></html>');
    expect(response.setHeader).toHaveBeenCalledWith(SESSION_EXPIRY_HEADER, '1234567');
    expect(html).toContain('<meta name="pmyc-session-expires-at" content="1234567"></head>');
  });

  test.each(['/team/players.php', '/admin/dashboard.php', '/sat-admin/dashboard.php'])(
    'reloads the protected %s page at the server-provided session deadline', (pathname) => {
      const browser = createBrowser(pathname);
      expect(browser.timers[0].delay).toBe(30 * 60 * 1000);
      browser.setCurrentTime(1_000_000 + 30 * 60 * 1000);
      browser.timers[0].callback();
      expect(browser.location.reload).toHaveBeenCalledTimes(1);
    }
  );

  test('does not start a protected-page timer on a role login page', () => {
    const browser = createBrowser('/sat-admin/login.php');
    expect(browser.timers).toHaveLength(0);
    expect(browser.window.__pmycSessionExpiryHandler).toBeUndefined();
  });

  test('uses the refreshed deadline returned by an authenticated request', async () => {
    const browser = createBrowser('/team/players.php');
    browser.setCurrentTime(1_010_000);
    const refreshedDeadline = 1_014_000;
    browser.response.headers.get.mockReturnValue(String(refreshedDeadline));
    await browser.window.fetch('/api/team/players/save');
    expect(browser.timers[browser.timers.length - 1].delay).toBe(refreshedDeadline - 1_010_000);
  });

  test.each([
    ['/team/players.php', '/team/login.php?expired=1'],
    ['/admin/dashboard.php', '/admin/index.php?error=unauthorized&expired=1'],
    ['/sat-admin/dashboard.php', '/sat-admin/login.php?expired=1']
  ])('uses the server redirect for %s after a protected request expires', async (pathname, redirectPath) => {
    const browser = createBrowser(pathname);
    const redirectUrl = `https://pmycfootball.in.th${redirectPath}`;
    browser.response.status = 401;
    browser.response.ok = false;
    browser.response.clone = () => ({ json: async () => ({ expired: true, redirectUrl }) });
    await browser.window.fetch('/api/team/players/save');
    expect(browser.location.replace).toHaveBeenCalledWith(redirectUrl);
  });
});
