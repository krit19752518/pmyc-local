import fs from 'node:fs';
import path from 'node:path';

const routerSrc = fs.readFileSync(
  path.join(__dirname, '../src/routes/admin/adminPortal.router.ts'),
  'utf8',
);

test('adminResetCategorySubmission updates rawTeamsData, awaits confirm dialog, and reloads page', () => {
  const start = routerSrc.indexOf('window.adminResetCategorySubmission = async function()');
  const end = routerSrc.indexOf('window.reviewTeamCategory = async function', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = routerSrc.slice(start, end);

  expect(block).toContain('found.submitted_categories = data.submitted_categories');
  expect(block).toContain('found.submittedCategories = data.submittedCategories');
  expect(block).toContain('renderTeamsTable()');
  expect(block).toContain("confirmButtonText: 'ตกลง'");
  expect(block).toContain('await Swal.fire(');
  expect(block).toContain('window.location.reload()');
});
