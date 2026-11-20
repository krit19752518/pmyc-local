import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const php = process.env.PHASE2_PHP_BINARY || path.join(root, '.runtime/phase2-php/php');

describe('issue119 pending-bracket status badge and notice text', () => {
  it('removes legacy ceremony-reveal wording and shows clear confirmation notice and result link', () => {
    const src = fs.readFileSync(path.join(root, 'phase2/src/BracketPages.php'), 'utf8');
    expect(src).not.toContain('รอเปิดทีมจนครบเพื่อพร้อมจัดตารางแข่งขัน');
    expect(src).not.toContain('กำลังเปิดผลจับสลาก');
    expect(src).not.toContain('เปิดผลการจับสลาก');
    expect(src).toContain("'PENDING_CONFIRMATION' => 'รอยืนยันผลจับสลาก'");
    expect(src).toContain('ผลจับสลากรอยืนยันและล็อกก่อนจัดตารางแข่งขัน');
    expect(src).toContain('ตำแหน่งทีมยังเปลี่ยนแปลงได้จนกว่าจะยืนยันและล็อกผลจับสลาก');
    expect(src).toContain("WorkspaceView::url('result',$filters)");
    expect(src).toContain('ตรวจผลการจับสลาก →');
  });

  it('renders bracket fixture cleanly via PHP', () => {
    const result = spawnSync(php, [path.join(root, 'tests/fixtures/issue65-dashboard.php'), 'source-bracket-partial'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8' },
    });
    if (result.status !== 0) {
      throw new Error('PHP bracket fixture failed: ' + (result.stderr || result.stdout || result.error?.message));
    }
    const parsed = JSON.parse(result.stdout);
    expect(parsed.response[0]).toBe(200);
    expect(parsed.response[1]).toContain('สายการแข่งขัน');
  });

  it('applies readable bracket card background, bold team typography, and clear connector lines', () => {
    const css = fs.readFileSync(path.join(root, 'phase2/public/assets/workspace.css'), 'utf8');
    expect(css).toContain('.workspace-v17 .bracket-match{background:#f3f7fc;border:1.5px solid #9cb4cf;border-left:4px solid var(--navy)');
    expect(css).toContain('.workspace-v17 .bracket-team{font-size:15px;font-weight:700;color:var(--navy-deep)');
    expect(css).toContain('.workspace-v17 .bracket-match:after{width:65px;border-top:2px solid #5c7a9c}');
    expect(css).toContain('.workspace-v17 .bracket-team+.bracket-team{border-top:1.5px solid #bfd0e2}');
  });
});
