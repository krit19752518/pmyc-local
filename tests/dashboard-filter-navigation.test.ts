import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(__dirname, '../phase2/public/assets/workspace.js'), 'utf8');

function run(
  href = 'http://localhost/phase2demo/workspace/dashboard?dashboard_filters=1&province=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88',
  initialStorage: Record<string, string> = {},
  withForm = true,
) {
  const handlers: Record<string, Function[]> = {};
  const storage = new Map<string, string>(Object.entries(initialStorage));
  let destination = '';
  const province = {
    name: 'province',
    tagName: 'SELECT',
    readOnly: false,
    value: 'เชียงใหม่',
    checkValidity: () => true,
    setCustomValidity: () => {},
    addEventListener: () => {},
  };
  const district = { value: 'หางดง' };
  const fields: Record<string, any> = {
    dashboard_filters: { value: '1' },
    event_id: { value: 'event-test' },
    data_mode: { value: 'demo' },
    season_id: { value: 'season-1' },
    division_code: { value: 'U18_BOY' },
    stage: { value: '1' },
    province,
    district,
  };
  const form = withForm
    ? {
        action: 'http://localhost/phase2demo/workspace/dashboard',
        elements: { namedItem: (n: string) => fields[n] },
        addEventListener: (n: string, fn: Function) => {
          (handlers['form:' + n] ??= []).push(fn);
        },
        querySelectorAll: () => [],
      }
    : null;
  const clear = {
    addEventListener: (n: string, fn: Function) => {
      (handlers['clear:' + n] ??= []).push(fn);
    },
  };
  const makeLink = (initialHref: string, inHeading = false) => {
    let cur = initialHref;
    return {
      closest: (sel: string) => (sel === '.page-heading' && inHeading ? {} : null),
      getAttribute: (k: string) => (k === 'href' ? cur : null),
      setAttribute: (k: string, v: string) => {
        if (k === 'href') cur = v;
      },
      addEventListener: (n: string, fn: Function) => {
        (handlers['link:' + n] ??= []).push(fn);
      },
      get href() {
        return cur;
      },
    };
  };
  const dashLink = makeLink('/phase2demo/workspace/dashboard?event_id=event-test&data_mode=demo');
  const setupLink = makeLink('/phase2demo/workspace/pending-setup?event_id=event-test&data_mode=demo');
  const sidebar = { classList: { remove: () => {}, contains: () => false }, querySelector: () => null };
  const toggle = { setAttribute: () => {}, addEventListener: () => {}, focus: () => {} };
  const backdrop = { hidden: true, addEventListener: () => {} };
  const root = {
    querySelector: (q: string) =>
      ({
        '.sidebar': sidebar,
        '.mobile-toggle': toggle,
        '.workspace-backdrop': backdrop,
        '.workspace-filters': form,
        '[data-dashboard-clear]': clear,
      }[q] || null),
    querySelectorAll: (q: string) => {
      if (q.includes('/phase2demo/workspace/dashboard') && q.includes('/phase2demo/workspace/pending-setup')) {
        return [dashLink, setupLink];
      }
      return [];
    },
  };
  const window = {
    location: {
      href,
      assign: (u: string) => {
        destination = u;
      },
    },
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => root, addEventListener: () => {} },
    window,
    URL,
    performance: { getEntriesByType: () => [{ type: 'navigate' }] },
    sessionStorage: {
      getItem: (k: string) => storage.get(k) || null,
      removeItem: (k: string) => storage.delete(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  return {
    handlers,
    storage,
    dashLink,
    setupLink,
    get destination() {
      return destination;
    },
  };
}

test('navigating back to Dashboard with filters does not auto-clear and saves scope filters', () => {
  const r = run();
  expect(r.destination).toBe('');
  const saved = JSON.parse(r.storage.get('pmyc-workspace-filters:event-test:demo') || '{}');
  expect(saved).toEqual({
    season_id: 'season-1',
    division_code: 'U18_BOY',
    stage: '1',
    province: 'เชียงใหม่',
    district: 'หางดง',
  });
});

test('saved filters are restored onto Dashboard and Setup links when returning from another page', () => {
  const saved = JSON.stringify({
    season_id: 'season-1',
    division_code: 'U18_BOY',
    stage: '1',
    province: 'เชียงใหม่',
    district: 'หางดง',
  });
  const r = run(
    'http://localhost/phase2demo/workspace/pending-schedule?event_id=event-test&data_mode=demo',
    { 'pmyc-workspace-filters:event-test:demo': saved },
    false,
  );
  const dashUrl = new URL(r.dashLink.href, 'http://localhost');
  const setupUrl = new URL(r.setupLink.href, 'http://localhost');
  expect(dashUrl.searchParams.get('dashboard_filters')).toBe('1');
  expect(dashUrl.searchParams.get('division_code')).toBe('U18_BOY');
  expect(dashUrl.searchParams.get('province')).toBe('เชียงใหม่');
  expect(setupUrl.searchParams.get('division_code')).toBe('U18_BOY');
  expect(setupUrl.searchParams.get('district')).toBe('หางดง');
  expect(setupUrl.searchParams.has('dashboard_filters')).toBe(false);
});

test('clear button clears saved filters and resets URL while keeping event context', () => {
  const r = run();
  r.handlers['clear:click'][0]();
  const url = new URL(r.destination);
  expect(url.searchParams.get('event_id')).toBe('event-test');
  expect(url.searchParams.get('data_mode')).toBe('demo');
  expect(url.searchParams.has('province')).toBe(false);
  expect(url.searchParams.has('dashboard_filters')).toBe(false);
  expect(r.storage.has('pmyc-workspace-filters:event-test:demo')).toBe(false);
});
