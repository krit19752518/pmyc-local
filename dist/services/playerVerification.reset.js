"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetGeneration = resetGeneration;
exports.resetBoundKey = resetBoundKey;
exports.resetVerification = resetVerification;
const crypto_1 = require("crypto");
async function resetGeneration(playerId, db) {
    const result = await db.query("SELECT id FROM football_player_ai_verification WHERE player_id=$1 AND error_code='REVIEW_RESET' ORDER BY created_at DESC LIMIT 1", [playerId]);
    return result.rows[0]?.id || null;
}
function resetBoundKey(key, generation) {
    return generation ? (0, crypto_1.createHash)('sha256').update(JSON.stringify(['player-review-reset-v1', key, generation])).digest('hex') : key;
}
/** Caller holds the player advisory/row locks and transaction; usage/audit remain intact. */
async function resetVerification(db, playerId, reviewerId, notes) {
    await db.query("UPDATE football_player_ai_verification SET state='FAILED',error_code='REVIEW_RESET_CLEARED',result=NULL,review=NULL,updated_at=clock_timestamp() WHERE player_id=$1", [playerId]);
    const id = (0, crypto_1.randomUUID)();
    await db.query(`INSERT INTO football_player_ai_verification(id,player_id,source_hash,state,error_code,review,reviewed_by,reviewed_at,created_at,updated_at)
    VALUES($1,$2,$3,'FAILED','REVIEW_RESET',$4::jsonb,$5,clock_timestamp(),clock_timestamp(),clock_timestamp())`, [id, playerId, '0'.repeat(64), JSON.stringify({ ...notes, decisions: {}, docStatus: 'PENDING', statusSource: 'MANUAL', reviewVersion: 2 }), reviewerId]);
    return id;
}
