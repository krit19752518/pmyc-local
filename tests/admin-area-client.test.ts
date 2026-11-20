import { renderAdminLayout } from '../src/adminLayout';
import vm from 'node:vm';

it.each(['teams-demo', 'teams', 'teams-u14', 'bracket-demo-u14'] as const)(
  'initializes the district helper before page scripts for %s', nav => {
    const html = renderAdminLayout('Teams', '<script>window.pageDistrict = window.PmycTeamArea.getTeamDistrictName({province:"กรุงเทพมหานคร",district:"ดอนเมือง"});</script>', nav, '');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const helperIndex = scripts.findIndex(s => s.includes('window.PmycTeamArea ='));
    const consumerIndex = scripts.findIndex(s => s.includes('window.pageDistrict ='));
    expect(helperIndex).toBeGreaterThanOrEqual(0);
    expect(helperIndex).toBeLessThan(consumerIndex);
    const window: any = {};
    vm.runInNewContext(scripts[helperIndex], { window });
    vm.runInNewContext(scripts[consumerIndex], { window });
    expect(window.pageDistrict).toBe('ดอนเมือง');
    for (const district of ['ดินแดง', 'หางดง', 'ดอยเต่า']) {
      expect(window.PmycTeamArea.getTeamDistrictName({province: district === 'ดินแดง' ? 'กรุงเทพมหานคร' : 'เชียงใหม่',district})).toBe(district);
    }
    expect(scripts.filter(script => script.includes('window.PmycTeamArea ='))).toHaveLength(1);
  }
);
