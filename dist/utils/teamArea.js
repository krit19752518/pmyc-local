"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BANGKOK_DISTRICTS = void 0;
exports.normalizeProvince = normalizeProvince;
exports.normalizeDistrictName = normalizeDistrictName;
exports.isValidDistrict = isValidDistrict;
exports.getRegistrationArea = getRegistrationArea;
exports.getTeamDistrictName = getTeamDistrictName;
exports.normalizeDistrictForSave = normalizeDistrictForSave;
exports.renderTeamAreaClientScript = renderTeamAreaClientScript;
/** Administrative area only: competition zones must never be used as districts. */
const bangkokDistrictNames = ["คลองสาน", "คลองสามวา", "คลองเตย", "คันนายาว", "จตุจักร", "จอมทอง", "ดอนเมือง", "ดินแดง", "ดุสิต", "ตลิ่งชัน", "ทุ่งครุ", "ธนบุรี", "บางกอกน้อย", "บางกอกใหญ่", "บางกะปิ", "บางขุนเทียน", "บางคอแหลม", "บางซื่อ", "บางนา", "บางบอน", "บางพลัด", "บางรัก", "บางเขน", "บางแค", "บึงกุ่ม", "ปทุมวัน", "ประเวศ", "ป้อมปราบศัตรูพ่าย", "พญาไท", "พระนคร", "พระโขนง", "ภาษีเจริญ", "มีนบุรี", "ยานนาวา", "ราชเทวี", "ราษฎร์บูรณะ", "ลาดกระบัง", "ลาดพร้าว", "วังทองหลาง", "วัฒนา", "สวนหลวง", "สะพานสูง", "สัมพันธวงศ์", "สาทร", "สายไหม", "หนองจอก", "หนองแขม", "หลักสี่", "ห้วยขวาง", "ทวีวัฒนา"];
exports.BANGKOK_DISTRICTS = bangkokDistrictNames;
function normalizeProvince(value) {
    const province = String(value ?? '').trim();
    return ['กรุงเทพฯ', 'กรุงเทพมหานคร (กกท. ประจำจังหวัด)'].includes(province) ? 'กรุงเทพมหานคร' : province;
}
function normalizeDistrictName(value, province) {
    const district = String(value ?? '').trim();
    return normalizeProvince(province) === 'กรุงเทพมหานคร' ? district.replace(/^เขต\s*/, '').trim() : district;
}
function isValidDistrict(value, province) {
    const district = normalizeDistrictName(value, province);
    return Boolean(district) && (normalizeProvince(province) !== 'กรุงเทพมหานคร' || bangkokDistrictNames.includes(district));
}
function getRegistrationArea(team) {
    const province = normalizeProvince(String(team.province ?? '').trim() || team.contact_province);
    let rawDistrict = String(team.district ?? '').trim();
    // Legacy contact fallback is allowed only when its province is explicitly the same.
    if (!rawDistrict && normalizeProvince(team.contact_province) === province)
        rawDistrict = String(team.contact_district ?? '').trim();
    return { province, district: isValidDistrict(rawDistrict, province) ? normalizeDistrictName(rawDistrict, province) : '' };
}
/** Display unknown legacy names without assigning them a registration rank. */
function getTeamDistrictName(team) {
    const area = getRegistrationArea(team);
    return normalizeDistrictName(String(team.district ?? '').trim() || area.district, area.province);
}
/** Normalize only valid submitted values; preserve unknown legacy values when unchanged. */
function normalizeDistrictForSave(value, province, previous) {
    const district = normalizeDistrictName(value, province);
    if (district && !isValidDistrict(district, province)) {
        if (previous !== undefined && normalizeDistrictName(previous, province) === district)
            return String(previous ?? '').trim();
        throw new Error('กรุณาเลือกเขตของกรุงเทพมหานครให้ถูกต้อง');
    }
    return district;
}
// The exact same pure functions run in client filters and address dropdowns.
function renderTeamAreaClientScript() {
    return '<script>window.PmycTeamArea = (function(){const bangkokDistrictNames=' + JSON.stringify(exports.BANGKOK_DISTRICTS)
        + ';' + normalizeProvince.toString() + ';' + normalizeDistrictName.toString() + ';' + isValidDistrict.toString()
        + ';' + getRegistrationArea.toString() + ';' + getTeamDistrictName.toString()
        + ';return {normalizeProvince,normalizeDistrictName,isValidDistrict,getRegistrationArea,getTeamDistrictName};})();</script>';
}
