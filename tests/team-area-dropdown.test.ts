import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { renderTeamAreaClientScript } from '../src/utils/teamArea';

// Exercise the actual served address script with a small select/form DOM, without a network listener.
function dropdown(zoneValue: string, current: string, contact = false) {
  const listeners: Record<string, Function> = {};
  const options: any[] = [];
  const attrs: Record<string, string> = { 'data-current-val': current };
  let value = current;
  const district = {
    name: contact ? 'contact_district' : 'district',
    get value() { return value; }, set value(v) { value = v; },
    set innerHTML(_v: string) { options.length = 0; value = ''; },
    appendChild(option: any) { options.push(option); if (option.selected) value = option.value; },
    getAttribute(key: string) { return attrs[key] || ''; },
    setAttribute(key: string, val: string) { attrs[key] = val; },
    addEventListener(key: string, fn: Function) { listeners['district:' + key] = fn; }
  };
  const zone = { value: zoneValue, addEventListener(key: string, fn: Function) { listeners['zone:' + key] = fn; } };
  const form = {
    querySelector(selector: string) {
      if (selector === '#bkkZoneContainer') return { style: {} };
      if (selector === 'select[name="bkk_zone"]') return zone;
      return district;
    },
    querySelectorAll() { return []; }
  };
  const province = { name: contact ? 'contact_province' : 'province', value: 'กรุงเทพมหานคร', closest: () => form,
    getAttribute: () => '', addEventListener(key: string, fn: Function) { listeners['province:' + key] = fn; } };
  let ready: Function = () => undefined;
  const context: any = { window: {}, document: {
    addEventListener(event: string, fn: Function) { if (event === 'DOMContentLoaded') ready = fn; },
    querySelectorAll: () => [province], querySelector: () => null, createElement: () => ({})
  } };
  vm.runInNewContext(renderTeamAreaClientScript().replace(/^<script>|<\/script>$/g, ''), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/assets/data/thai-administrative-divisions.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/assets/js/app.bb3bd3ab.js'), 'utf8'), context);
  ready();
  return { district, options, listeners, zone };
}

test.each(['', 'พระนคร 2'])('zone %j emits canonical options and preserves a prefixed legacy selection', zone => {
  const form = dropdown(zone, 'เขต บางกะปิ');
  expect(form.district.value).toBe('บางกะปิ');
  expect(form.options.filter(o => o.value === 'บางกะปิ')).toHaveLength(1);
  expect(form.options.some(o => String(o.textContent).startsWith('เขต'))).toBe(false);
  form.listeners['district:change']();
  expect(form.zone.value).toBe('พระนคร 2');
  form.listeners['zone:change']();
  expect(form.district.value).toBe('บางกะปิ');
});

test('unknown legacy district is retained, not silently cleared by the dropdown', () => {
  const form = dropdown('พระนคร 2', 'ชื่อเก่าที่ต้องตรวจสอบ');
  expect(form.district.value).toBe('ชื่อเก่าที่ต้องตรวจสอบ');
  expect(form.options.filter(o => o.value === 'ชื่อเก่าที่ต้องตรวจสอบ')).toHaveLength(1);
});

test('contact address dropdown normalizes its own district without a registration-zone dependency', () => {
  const form = dropdown('', 'เขตบางกะปิ', true);
  expect(form.district.value).toBe('บางกะปิ');
  expect(form.options.filter(o => o.value === 'บางกะปิ')).toHaveLength(1);
});
