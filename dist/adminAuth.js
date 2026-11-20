"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.satOfficersDatabase = exports.adminUsersDatabase = exports.ADMIN_ROLES = void 0;
exports.initAdminTables = initAdminTables;
exports.authenticateAdmin = authenticateAdmin;
exports.getAdminUserByUsername = getAdminUserByUsername;
exports.getAdminUsersList = getAdminUsersList;
exports.createAdminUser = createAdminUser;
exports.getSatOfficersList = getSatOfficersList;
exports.createSatOfficer = createSatOfficer;
exports.updateSatOfficer = updateSatOfficer;
exports.deleteSatOfficer = deleteSatOfficer;
const db_1 = require("./db");
// Default Seed Roles & Permissions
exports.ADMIN_ROLES = {
    SUPER_ADMIN: {
        code: 'SUPER_ADMIN',
        name: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    },
    DOCUMENT_VERIFIER: {
        code: 'DOCUMENT_VERIFIER',
        name: 'เจ้าหน้าที่ตรวจเอกสาร',
        permissions: ['teams:read', 'teams:verify']
    },
    SAT_OFFICER: {
        code: 'SAT_OFFICER',
        name: 'เจ้าหน้าที่ กกท. ประจำจังหวัด',
        permissions: ['teams:read', 'teams:verify']
    }
};
// In-Memory Fallback Admin Store
exports.adminUsersDatabase = [
    {
        id: 'ADM-001',
        username: 'admin',
        passwordHash: '12348765', // Updated password
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: exports.ADMIN_ROLES.SUPER_ADMIN.permissions,
        createdAt: '2026-09-17 00:00:00'
    },
    {
        id: 'ADM-002',
        username: 'verifier01',
        passwordHash: '123456',
        fullname: 'นายตรวจ เอกสารดี (Verifier)',
        roleCode: 'DOCUMENT_VERIFIER',
        roleName: 'เจ้าหน้าที่ตรวจเอกสาร',
        permissions: exports.ADMIN_ROLES.DOCUMENT_VERIFIER.permissions,
        createdAt: '2026-09-17 00:00:00'
    }
];
// In-Memory Fallback SAT Officers Store
exports.satOfficersDatabase = [];
// Initialize DB Tables for Admin Roles, Users & SAT Officers
async function initAdminTables() {
    try {
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        fullname VARCHAR(100) NOT NULL,
        role_code VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sat_officers (
        id VARCHAR(50) PRIMARY KEY,
        fullname VARCHAR(100) NOT NULL,
        position VARCHAR(150) NOT NULL,
        province VARCHAR(100) NOT NULL,
        phone VARCHAR(50),
        line_id VARCHAR(100),
        email VARCHAR(100),
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE sat_officers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE sat_officers ADD COLUMN IF NOT EXISTS line_id VARCHAR(100);
    `);
        // Insert Default Super Admin if not exists
    }
    catch (e) {
        console.warn('PostgreSQL Table init error or offline (falling back to memory):', e);
    }
}
// Authenticate Admin Credentials
async function authenticateAdmin(username, passInput) {
    const u = (username || '').trim();
    const p = (passInput || '').trim();
    // 1. Check admin_users DB table first (Case-insensitive username check)
    try {
        const res = await db_1.pool.query('SELECT * FROM admin_users WHERE LOWER(username) = LOWER($1)', [u]);
        if (res.rows.length > 0) {
            const dbUser = res.rows[0];
            if (dbUser.password_hash.trim() === p) {
                const role = dbUser.role_code === 'SUPER_ADMIN' ? exports.ADMIN_ROLES.SUPER_ADMIN : exports.ADMIN_ROLES.DOCUMENT_VERIFIER;
                return {
                    id: dbUser.id,
                    username: dbUser.username,
                    fullname: dbUser.fullname,
                    roleCode: role.code,
                    roleName: role.name,
                    permissions: role.permissions
                };
            }
        }
    }
    catch (e) {
        // DB error fallback
    }
    // 2. Check sat_officers DB table & store (SAT_OFFICER login using email / username and password)
    try {
        const satRes = await db_1.pool.query('SELECT * FROM sat_officers WHERE email = $1 OR fullname = $1 OR id = $1', [u]);
        if (satRes.rows.length > 0) {
            const sat = satRes.rows[0];
            if (sat.password_hash && sat.password_hash === p) {
                return {
                    id: sat.id,
                    username: sat.email || sat.fullname,
                    fullname: sat.fullname + ' (' + sat.position + ')',
                    roleCode: 'SAT_OFFICER',
                    roleName: 'เจ้าหน้าที่ กกท. (' + sat.province + ')',
                    permissions: exports.ADMIN_ROLES.SAT_OFFICER.permissions,
                    province: sat.province
                };
            }
        }
    }
    catch (e) {
        // DB error fallback
    }
    // Fallback check in satOfficersDatabase memory store
    const foundSat = exports.satOfficersDatabase.find(s => (s.email === u || s.fullname === u || s.id === u) && s.passwordHash === p);
    if (foundSat) {
        return {
            id: foundSat.id,
            username: foundSat.email || foundSat.fullname,
            fullname: foundSat.fullname + ' (' + foundSat.position + ')',
            roleCode: 'SAT_OFFICER',
            roleName: 'เจ้าหน้าที่ กกท. (' + foundSat.province + ')',
            permissions: exports.ADMIN_ROLES.SAT_OFFICER.permissions,
            province: foundSat.province
        };
    }
    // 3. Check In-memory store & Hardcoded Legacy Support
    const found = exports.adminUsersDatabase.find(x => x.username === u && x.passwordHash === p);
    if (found) {
        return {
            id: found.id,
            username: found.username,
            fullname: found.fullname,
            roleCode: found.roleCode,
            roleName: found.roleName,
            permissions: found.permissions
        };
    }
    // Legacy Fallback (Scalling / Scalling => SUPER_ADMIN)
    if (u === 'Scalling' && p === 'Scalling') {
        return {
            id: 'ADM-LEGACY',
            username: 'Scalling',
            fullname: 'Scalling Staff',
            roleCode: 'SUPER_ADMIN',
            roleName: 'ผู้ดูแลระบบสูงสุด',
            permissions: exports.ADMIN_ROLES.SUPER_ADMIN.permissions
        };
    }
    return null;
}
// Get Admin User By Username Only (for session preservation)
async function getAdminUserByUsername(username) {
    const u = username.trim();
    if (!u)
        return null;
    // 1. Check admin_users DB table & store first
    try {
        const res = await db_1.pool.query('SELECT * FROM admin_users WHERE LOWER(username) = LOWER($1)', [u]);
        if (res.rows.length > 0) {
            const dbUser = res.rows[0];
            const role = dbUser.role_code === 'SUPER_ADMIN' ? exports.ADMIN_ROLES.SUPER_ADMIN : exports.ADMIN_ROLES.DOCUMENT_VERIFIER;
            return {
                id: dbUser.id,
                username: dbUser.username,
                fullname: dbUser.fullname,
                roleCode: role.code,
                roleName: role.name,
                permissions: role.permissions
            };
        }
    }
    catch (e) { }
    const found = exports.adminUsersDatabase.find(x => x.username === u);
    if (found) {
        return {
            id: found.id,
            username: found.username,
            fullname: found.fullname,
            roleCode: found.roleCode,
            roleName: found.roleName,
            permissions: found.permissions
        };
    }
    if (u === 'admin' || u === 'SUPER_ADMIN') {
        return {
            id: 'ADM-001',
            username: 'admin',
            fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
            roleCode: 'SUPER_ADMIN',
            roleName: 'ผู้ดูแลระบบสูงสุด',
            permissions: exports.ADMIN_ROLES.SUPER_ADMIN.permissions
        };
    }
    // 2. Check sat_officers DB table & store
    try {
        const satRes = await db_1.pool.query('SELECT * FROM sat_officers WHERE email = $1 OR fullname = $1 OR id = $1', [u]);
        if (satRes.rows.length > 0) {
            const sat = satRes.rows[0];
            return {
                id: sat.id,
                username: sat.email || sat.fullname,
                fullname: sat.fullname + ' (' + sat.position + ')',
                roleCode: 'SAT_OFFICER',
                roleName: 'เจ้าหน้าที่ กกท. (' + sat.province + ')',
                permissions: exports.ADMIN_ROLES.SAT_OFFICER.permissions,
                province: sat.province
            };
        }
    }
    catch (e) { }
    const foundSat = exports.satOfficersDatabase.find(s => s.email === u || s.fullname === u || s.id === u);
    if (foundSat) {
        return {
            id: foundSat.id,
            username: foundSat.email || foundSat.fullname,
            fullname: foundSat.fullname + ' (' + foundSat.position + ')',
            roleCode: 'SAT_OFFICER',
            roleName: 'เจ้าหน้าที่ กกท. (' + foundSat.province + ')',
            permissions: exports.ADMIN_ROLES.SAT_OFFICER.permissions,
            province: foundSat.province
        };
    }
    return null;
}
// Get All Admin Users (Super Admin Only)
async function getAdminUsersList() {
    try {
        const res = await db_1.pool.query('SELECT id, username, fullname, role_code FROM admin_users ORDER BY created_at ASC');
        if (res.rows.length > 0) {
            return res.rows.map(r => ({
                id: r.id,
                username: r.username,
                fullname: r.fullname,
                roleCode: r.role_code,
                roleName: r.role_code === 'SUPER_ADMIN' ? 'ผู้ดูแลระบบสูงสุด' : 'เจ้าหน้าที่ตรวจเอกสาร',
                permissions: r.role_code === 'SUPER_ADMIN' ? exports.ADMIN_ROLES.SUPER_ADMIN.permissions : exports.ADMIN_ROLES.DOCUMENT_VERIFIER.permissions
            }));
        }
    }
    catch (e) {
        // fallback
    }
    return exports.adminUsersDatabase.map(u => ({
        id: u.id,
        username: u.username,
        fullname: u.fullname,
        roleCode: u.roleCode,
        roleName: u.roleName,
        permissions: u.permissions
    }));
}
// Add New Admin User (Super Admin Only)
async function createAdminUser(username, passInput, fullname, roleCode) {
    if (passInput && passInput.length < 8) {
        throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    }
    const id = 'ADM-' + Date.now();
    const role = roleCode === 'SUPER_ADMIN' ? exports.ADMIN_ROLES.SUPER_ADMIN : exports.ADMIN_ROLES.DOCUMENT_VERIFIER;
    const newUser = {
        id,
        username,
        fullname,
        roleCode: role.code,
        roleName: role.name,
        permissions: role.permissions
    };
    try {
        await db_1.pool.query('INSERT INTO admin_users (id, username, password_hash, fullname, role_code) VALUES ($1, $2, $3, $4, $5)', [id, username, passInput, fullname, roleCode]);
    }
    catch (e) {
        console.warn('DB Error on createAdminUser, adding to memory fallback:', e);
    }
    exports.adminUsersDatabase.push({
        id,
        username,
        passwordHash: passInput,
        fullname,
        roleCode,
        roleName: role.name,
        permissions: role.permissions,
        createdAt: new Date().toISOString()
    });
    return newUser;
}
// Get All SAT Officers
async function getSatOfficersList() {
    try {
        const res = await db_1.pool.query('SELECT * FROM sat_officers ORDER BY province ASC, created_at ASC');
        if (res.rows.length > 0) {
            return res.rows.map(r => ({
                id: r.id,
                fullname: r.fullname,
                position: r.position,
                province: r.province,
                phone: r.phone || '-',
                lineId: r.line_id || '',
                email: r.email || '-',
                createdAt: r.created_at
            }));
        }
    }
    catch (e) {
        // fallback
    }
    return exports.satOfficersDatabase;
}
// Create New SAT Officer
async function createSatOfficer(fullname, position, province, phone, email, passwordHash = '123456', lineId = '') {
    const pass = passwordHash || '123456';
    if (pass.length < 8) {
        throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    }
    const id = 'SAT-' + Date.now();
    const newOfficer = {
        id,
        fullname,
        position,
        province,
        phone: phone || '-',
        lineId: lineId || '',
        email: email || '-',
        passwordHash: pass,
        createdAt: new Date().toISOString()
    };
    try {
        await db_1.pool.query('INSERT INTO sat_officers (id, fullname, position, province, phone, email, password_hash, line_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [id, fullname, position, province, phone, email, pass, lineId || null]);
    }
    catch (e) {
        console.warn('DB Error on createSatOfficer, adding to memory fallback:', e);
    }
    exports.satOfficersDatabase.push(newOfficer);
    return newOfficer;
}
// Update Existing SAT Officer
async function updateSatOfficer(id, fullname, position, province, phone, email, passwordHash, lineId = '') {
    if (passwordHash && passwordHash.length < 8) {
        throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    }
    try {
        if (passwordHash) {
            await db_1.pool.query('UPDATE sat_officers SET fullname = $1, position = $2, province = $3, phone = $4, email = $5, password_hash = $6, line_id = $7 WHERE id = $8', [fullname, position, province, phone, email, passwordHash, lineId || null, id]);
        }
        else {
            await db_1.pool.query('UPDATE sat_officers SET fullname = $1, position = $2, province = $3, phone = $4, email = $5, line_id = $6 WHERE id = $7', [fullname, position, province, phone, email, lineId || null, id]);
        }
    }
    catch (e) {
        console.warn('DB Error on updateSatOfficer, updating memory fallback:', e);
    }
    const found = exports.satOfficersDatabase.find(o => o.id === id);
    if (found) {
        found.fullname = fullname;
        found.position = position;
        found.province = province;
        found.phone = phone || '-';
        found.lineId = lineId || '';
        found.email = email || '-';
        if (passwordHash) {
            found.passwordHash = passwordHash;
        }
    }
    return true;
}
// Delete SAT Officer
async function deleteSatOfficer(id) {
    try {
        await db_1.pool.query('DELETE FROM sat_officers WHERE id = $1', [id]);
    }
    catch (e) {
        console.warn('DB Error on deleteSatOfficer, deleting from memory fallback:', e);
    }
    const idx = exports.satOfficersDatabase.findIndex(o => o.id === id);
    if (idx !== -1) {
        exports.satOfficersDatabase.splice(idx, 1);
    }
    return true;
}
