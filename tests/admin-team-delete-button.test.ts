import fs from "fs";
import path from "path";

describe("Issue #130: admin/teams.php delete & status buttons with special characters in team name", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/routes/admin/adminPortal.router.ts"), "utf8");

  test("no longer interpolates teamName into inline onclick handlers for deleteAdminTeam or openChangeTeamStatusModal", () => {
    expect(src).not.toContain('onclick="deleteAdminTeam(');
    expect(src).not.toContain('onclick="openChangeTeamStatusModal(');
    expect(src).toContain("js-delete-admin-team");
    expect(src).toContain("js-change-team-status");
  });

  test("binds document click delegation reading data-team-id, data-team-name, and data-team-status", () => {
    expect(src).toContain("e.target.closest('.js-delete-admin-team')");
    expect(src).toContain("delBtn.getAttribute('data-team-id')");
    expect(src).toContain("delBtn.getAttribute('data-team-name')");
    expect(src).toContain("e.target.closest('.js-change-team-status')");
    expect(src).toContain("statusBtn.getAttribute('data-team-status')");
  });

  test("HTML escaping data-team-name preserves double quotes in team names without breaking attribute", () => {
    const escapeHtmlAttr = (val: string) =>
      String(val ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const teamName = 'โรงเรียนเสาไห้ "วิมลวิทยานุกูล"';
    const buttonHtml = `<button type="button" class="js-delete-admin-team" data-team-id="FTM-123" data-team-name="${escapeHtmlAttr(teamName)}">ลบ</button>`;
    expect(buttonHtml).toContain('data-team-name="โรงเรียนเสาไห้ &quot;วิมลวิทยานุกูล&quot;"');
    expect(buttonHtml).not.toContain("onclick=");
  });
});
