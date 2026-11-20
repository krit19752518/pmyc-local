import fs from "fs";
import path from "path";
import { isAllowedTeamCertUpload, TEAM_CERT_UPLOAD_ERROR } from "../src/middleware/upload";

describe("Issue #128: team certificate upload validation & admin attachment preview", () => {
  test("isAllowedTeamCertUpload accepts only jpg, jpeg, png, pdf", () => {
    expect(isAllowedTeamCertUpload("cert.jpg", "image/jpeg")).toBe(true);
    expect(isAllowedTeamCertUpload("CERT.JPEG", "image/jpeg")).toBe(true);
    expect(isAllowedTeamCertUpload("cert.png", "image/png")).toBe(true);
    expect(isAllowedTeamCertUpload("cert.pdf", "application/pdf")).toBe(true);
    expect(isAllowedTeamCertUpload("cert.pdf", "application/octet-stream")).toBe(true);

    expect(isAllowedTeamCertUpload("cert.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(isAllowedTeamCertUpload("roster.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false);
    expect(isAllowedTeamCertUpload("cert.doc", "application/msword")).toBe(false);
    expect(isAllowedTeamCertUpload("cert.svg", "image/svg+xml")).toBe(false);
    expect(isAllowedTeamCertUpload("cert.jpg", "application/pdf")).toBe(false);
    expect(TEAM_CERT_UPLOAD_ERROR).toContain("JPG, PNG หรือ PDF");
  });

  test("api.router.ts wires parseTeamUploadAny on team registration and update routes", () => {
    const apiSrc = fs.readFileSync(path.join(__dirname, "../src/routes/api/api.router.ts"), "utf8");
    expect(apiSrc).toContain("TEAM_CERT_UPLOAD_ERROR");
    expect(apiSrc).toContain("router.post('/api/team/register', parseTeamUploadAny,");
    expect(apiSrc).toContain("router.post('/api/team/register-demo', parseTeamUploadAny,");
    expect(apiSrc).toContain("router.post('/api/team/team-update', checkTeamSession, parseTeamUploadAny,");
    expect(apiSrc).toContain("router.post('/api/team/players/save', checkTeamSession, parseTeamUploadAny,");
  });

  test("teamAuth and teamRoster restrict doc_team_cert accept attribute to jpg, png, pdf", () => {
    const expectedAccept = '<input type="file" name="doc_team_cert" class="form-control" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf">';
    const teamAuth = fs.readFileSync(path.join(__dirname, "../src/routes/team/teamAuth.router.ts"), "utf8");
    const teamRoster = fs.readFileSync(path.join(__dirname, "../src/routes/team/teamRoster.router.ts"), "utf8");
    expect(teamAuth).toContain(expectedAccept);
    expect(teamRoster).toContain(expectedAccept);
  });

  test("app.js and app.bb3bd3ab.js stay in sync with non-image viewPhoto fallback and client-side cert validation", () => {
    const appJs = fs.readFileSync(path.join(__dirname, "../public/assets/js/app.js"), "utf8");
    const appHashed = fs.readFileSync(path.join(__dirname, "../public/assets/js/app.bb3bd3ab.js"), "utf8");
    expect(appJs).toBe(appHashed);
    expect(appJs).toContain("nonImageExts.includes(ext)");
    expect(appJs).toContain("ลองเปิดไฟล์ในแท็บใหม่");
    expect(appJs).toContain("เปิด / ดาวน์โหลดไฟล์ PDF");
    expect(appJs).toContain("Validate doc_team_cert / docTeamCert");
  });
});
