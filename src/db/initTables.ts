import { pool } from '../db';

export async function initTeamTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS football_registered_team (
        id VARCHAR(50) PRIMARY KEY,
        team_name VARCHAR(150),
        school_code VARCHAR(50),
        province VARCHAR(100),
        bkk_zone VARCHAR(100),
        district VARCHAR(100),
        gender VARCHAR(20) DEFAULT 'boy',
        categories VARCHAR(100) DEFAULT '',
        manager_name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(50),
        line_id VARCHAR(100),
        house_no VARCHAR(50),
        road VARCHAR(100),
        subdistrict VARCHAR(100),
        contact_district VARCHAR(100),
        contact_subdistrict VARCHAR(100),
        contact_province VARCHAR(100),
        status VARCHAR(20) DEFAULT 'PENDING',
        reject_reason TEXT,
        username VARCHAR(50),
        password VARCHAR(100),
        doc_team_cert VARCHAR(255),
        doc_roster VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_player (
        id VARCHAR(50) PRIMARY KEY,
        team_id VARCHAR(50),
        name VARCHAR(100),
        prefix VARCHAR(50),
        first_name VARCHAR(100),
        middle_name VARCHAR(100),
        last_name VARCHAR(100),
        id_card VARCHAR(20),
        jersey_no VARCHAR(10),
        jersey_name VARCHAR(100),
        birth_date VARCHAR(50),
        position VARCHAR(50),
        category VARCHAR(20) DEFAULT 'U14',
        photo_url VARCHAR(255),
        fivb_id VARCHAR(50),
        domicile VARCHAR(100),
        height VARCHAR(20),
        weight VARCHAR(20),
        school VARCHAR(150),
        grade VARCHAR(50),
        guardian_name VARCHAR(100),
        guardian_relation VARCHAR(100),
        phone VARCHAR(50),
        doc_id_card VARCHAR(255),
        doc_school_cert VARCHAR(255),
        doc_parent_consent VARCHAR(255),
        doc_team_cert VARCHAR(255),
        doc_roster VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_official (
        id VARCHAR(50) PRIMARY KEY,
        team_id VARCHAR(50),
        name VARCHAR(100),
        role VARCHAR(50),
        phone VARCHAR(50),
        id_card VARCHAR(20),
        doc_id_card VARCHAR(255),
        email VARCHAR(100),
        categories VARCHAR(100),
        has_license VARCHAR(10) DEFAULT 'NO',
        license_type VARCHAR(100),
        license_serial VARCHAR(100),
        photo_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_team_profile (
        id VARCHAR(50) PRIMARY KEY,
        school VARCHAR(150),
        school_code VARCHAR(50),
        province VARCHAR(100),
        bkk_zone VARCHAR(100),
        district VARCHAR(100),
        gender VARCHAR(20) DEFAULT 'boy',
        categories VARCHAR(100),
        manager_name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(50),
        line_id VARCHAR(100),
        house_no VARCHAR(50),
        road VARCHAR(100),
        subdistrict VARCHAR(100),
        contact_district VARCHAR(100),
        contact_province VARCHAR(100),
        doc_team_cert VARCHAR(255),
        doc_roster VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_password_reset (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(100),
        username VARCHAR(50),
        token VARCHAR(255) UNIQUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_audit_log (
        id BIGSERIAL PRIMARY KEY,
        event_type VARCHAR(80) NOT NULL,
        actor_type VARCHAR(20) NOT NULL,
        actor_id VARCHAR(100),
        actor_name VARCHAR(150),
        actor_role VARCHAR(50),
        actor_province VARCHAR(100),
        team_id VARCHAR(50),
        entity_type VARCHAR(30) NOT NULL,
        entity_id VARCHAR(50) NOT NULL,
        old_state JSONB NOT NULL DEFAULT '{}'::jsonb,
        new_state JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address VARCHAR(64),
        user_agent TEXT,
        request_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE football_audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);

      CREATE TABLE IF NOT EXISTS football_competition_bracket (
        id BIGSERIAL PRIMARY KEY,
        category VARCHAR(3) NOT NULL CHECK (category IN ('U14', 'U16', 'U18')),
        province VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        bracket JSONB NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        updated_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (category, province, district)
      );

      CREATE TABLE IF NOT EXISTS football_support_report (
        id VARCHAR(50) PRIMARY KEY,
        reporter_user_id VARCHAR(100),
        reporter_username VARCHAR(150),
        reporter_name VARCHAR(150) NOT NULL,
        reporter_role VARCHAR(50) NOT NULL,
        team_id VARCHAR(50),
        province VARCHAR(100),
        page_description VARCHAR(200) NOT NULL,
        page_path TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
        priority VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
        category VARCHAR(100),
        assigned_to VARCHAR(100),
        resolution_notes TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_support_report_attachment (
        id VARCHAR(50) PRIMARY KEY,
        report_id VARCHAR(50) NOT NULL REFERENCES football_support_report(id),
        original_filename VARCHAR(255) NOT NULL,
        storage_name VARCHAR(100) NOT NULL UNIQUE,
        mime_type VARCHAR(100) NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS football_support_report_message (
        id BIGSERIAL PRIMARY KEY,
        report_id VARCHAR(50) NOT NULL REFERENCES football_support_report(id),
        sender_user_id VARCHAR(100),
        sender_name VARCHAR(150) NOT NULL,
        sender_role VARCHAR(50) NOT NULL,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('USER', 'ADMIN')),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_football_audit_log_created_at
        ON football_audit_log (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_audit_log_team_created_at
        ON football_audit_log (team_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_audit_log_actor_created_at
        ON football_audit_log (actor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_audit_log_request_id
        ON football_audit_log (request_id) WHERE request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_football_support_report_created_at
        ON football_support_report (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_support_report_status_created_at
        ON football_support_report (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_support_report_reporter_created_at
        ON football_support_report (reporter_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_support_report_team_created_at
        ON football_support_report (team_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_football_support_attachment_report
        ON football_support_report_attachment (report_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_football_support_message_report_created_at
        ON football_support_report_message (report_id, created_at DESC, id DESC);
    `);

    await pool.query('ALTER TABLE football_support_report ADD COLUMN IF NOT EXISTS additional_info TEXT;');
    await pool.query(`
      INSERT INTO football_support_report_message (
        report_id, sender_user_id, sender_name, sender_role, sender_type, message, created_at
      )
      SELECT r.id, COALESCE(r.reporter_user_id, r.reporter_username), r.reporter_name,
             r.reporter_role, 'USER', r.additional_info, r.updated_at
      FROM football_support_report r
      WHERE NULLIF(BTRIM(r.additional_info), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM football_support_report_message m
          WHERE m.report_id = r.id
            AND m.sender_type = 'USER'
            AND m.sender_user_id IS NOT DISTINCT FROM COALESCE(r.reporter_user_id, r.reporter_username)
            AND m.message = r.additional_info
        );
    `);
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS team_id VARCHAR(50);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS prefix VARCHAR(50);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS jersey_name VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS birth_date VARCHAR(50);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS fivb_id VARCHAR(50);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS domicile VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS height VARCHAR(20);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS weight VARCHAR(20);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS school VARCHAR(150);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS grade VARCHAR(50);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(100);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS phone VARCHAR(50);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS doc_id_card VARCHAR(255);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS doc_school_cert VARCHAR(255);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS doc_parent_consent VARCHAR(255);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS doc_team_cert VARCHAR(255);');
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS doc_roster VARCHAR(255);');
    await pool.query("ALTER TABLE football_player ADD COLUMN IF NOT EXISTS doc_status VARCHAR(50) DEFAULT 'PENDING';");
    await pool.query('ALTER TABLE football_player ADD COLUMN IF NOT EXISTS remarks TEXT;');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS id_card VARCHAR(20);');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS doc_id_card VARCHAR(255);');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS email VARCHAR(100);');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS team_id VARCHAR(50);');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS categories VARCHAR(100);');
    await pool.query("ALTER TABLE football_official ADD COLUMN IF NOT EXISTS has_license VARCHAR(10) DEFAULT 'NO';");
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS license_type VARCHAR(100);');
    await pool.query('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS license_serial VARCHAR(100);');

    await pool.query('ALTER TABLE football_registered_team ALTER COLUMN id TYPE VARCHAR(50);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS username VARCHAR(50);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS password VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS school_code VARCHAR(50);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS bkk_zone VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS district VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS gender VARCHAR(20);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS email VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS line_id VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS house_no VARCHAR(50);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS road VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS subdistrict VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS contact_district VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS contact_subdistrict VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS contact_province VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS categories VARCHAR(100);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS doc_team_cert VARCHAR(255);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS doc_roster VARCHAR(255);');
    await pool.query('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS reject_reason TEXT;');
    await pool.query("ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS submitted_categories VARCHAR(255) DEFAULT '';");
    await pool.query("ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS cancelled_categories VARCHAR(255) DEFAULT '';");
    await pool.query('ALTER TABLE football_team_profile ADD COLUMN IF NOT EXISTS categories VARCHAR(100);');
  } catch (e) {
    console.warn('PostgreSQL table init/alter notice (or offline):', e);
  }
}
