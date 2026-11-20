import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ceremonyPhp = fs.readFileSync(
  path.join(__dirname, '../phase2/src/CeremonyPages.php'),
  'utf8',
);
const workspaceJs = fs.readFileSync(
  path.join(__dirname, '../phase2/public/assets/workspace.js'),
  'utf8',
);

test('CeremonyPages renders confirm button and modal on pending-result without auto-activate', () => {
  expect(ceremonyPhp).toContain('data-open-draw-confirm>ยืนยันและล็อกผลทั้งชุด</button>');
  expect(ceremonyPhp).toContain('<dialog data-draw-confirm aria-labelledby="draw-confirm-title">');
  expect(ceremonyPhp).toContain("'operation'=>'confirm'");
  expect(ceremonyPhp).toContain('ยืนยันและล็อกผล</button>');
  expect(ceremonyPhp).not.toContain('data-draw-activate');
  expect(ceremonyPhp).not.toContain('ลองบันทึกอีกครั้ง');
});

test('workspace.js opens confirmation dialog and prevents duplicate confirm submits', () => {
  let shown = false;
  let closed = false;
  let openFocused = false;
  const listeners: Record<string, Record<string, (e?: any) => void>> = {
    open: {},
    closeBtn: {},
    dialog: {},
    form: {},
  };
  const submitBtn = { disabled: false };
  const openBtn = {
    addEventListener: (ev: string, fn: (e?: any) => void) => {
      listeners.open[ev] = fn;
    },
    focus: () => {
      openFocused = true;
    },
  };
  const closeBtn = {
    addEventListener: (ev: string, fn: (e?: any) => void) => {
      listeners.closeBtn[ev] = fn;
    },
  };
  const form = {
    addEventListener: (ev: string, fn: (e?: any) => void) => {
      listeners.form[ev] = fn;
    },
  };
  const confirmDialog = {
    showModal: () => {
      shown = true;
    },
    close: () => {
      closed = true;
    },
    addEventListener: (ev: string, fn: (e?: any) => void) => {
      listeners.dialog[ev] = fn;
    },
    querySelector: (sel: string) =>
      ({
        'button[type="submit"]': submitBtn,
        '[data-close-draw-confirm]': closeBtn,
        form,
      }[sel] ?? null),
  };
  const sidebar = { classList: { remove: () => {}, contains: () => false }, querySelector: () => null };
  const toggle = { setAttribute: () => {}, addEventListener: () => {}, focus: () => {} };
  const backdrop = { hidden: true, addEventListener: () => {} };
  const root = {
    querySelector: (sel: string) =>
      ({
        '.sidebar': sidebar,
        '.mobile-toggle': toggle,
        '.workspace-backdrop': backdrop,
        '[data-draw-confirm]': confirmDialog,
        '[data-open-draw-confirm]': openBtn,
      }[sel] ?? null),
    querySelectorAll: () => [],
  };
  const window = {
    location: { href: 'http://localhost/phase2demo/workspace/pending-result' },
    history: { replaceState: () => {} },
    addEventListener: () => {},
    matchMedia: () => ({ matches: true }),
    setTimeout: () => 0,
  };

  vm.runInNewContext(workspaceJs, {
    document: { querySelector: () => root, addEventListener: () => {} },
    window,
    URL,
    fetch: () => {
      throw new Error('Confirm flow must not auto-fetch activate');
    },
  });

  listeners.open.click();
  expect(shown).toBe(true);
  listeners.closeBtn.click();
  expect(closed).toBe(true);
  listeners.dialog.close();
  expect(openFocused).toBe(true);

  let prevented = false;
  listeners.form.submit({ preventDefault: () => { prevented = true; } });
  expect(submitBtn.disabled).toBe(true);
  expect(prevented).toBe(false);
  listeners.form.submit({ preventDefault: () => { prevented = true; } });
  expect(prevented).toBe(true);
});
