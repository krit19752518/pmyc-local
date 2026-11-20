--
-- PostgreSQL database dump
--

\restrict ed3KgKC2PT4CR6NfoG3EKodbXBNzgj1MlxcgM2J7OVbmf2hOODDQrPYdb1AhROa

-- Dumped from database version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: football_guard_women_official_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.football_guard_women_official_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF (to_jsonb(NEW)-'categories') IS DISTINCT FROM (to_jsonb(OLD)-'categories') THEN
  PERFORM id FROM football_registered_team WHERE id=NEW.team_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM football_category_official m JOIN football_category_enrollment e ON e.id=m.enrollment_id WHERE m.official_id=OLD.id AND m.active AND e.submitted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Official identity belongs to a submitted women enrollment' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: football_guard_women_province_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.football_guard_women_province_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF NEW.stage=1 AND NEW.district IS NULL AND NOT EXISTS
  (SELECT 1 FROM p2_event_division WHERE id=NEW.division_id AND event_id=NEW.event_id AND code='U18_GIRL') THEN
  RAISE EXCEPTION 'Only women first round may use province scope' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id character varying(50) NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    fullname character varying(100) NOT NULL,
    role_code character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: football_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_audit_log (
    id bigint NOT NULL,
    event_type character varying(80) NOT NULL,
    actor_type character varying(20) NOT NULL,
    actor_id character varying(100),
    actor_name character varying(150),
    actor_role character varying(50),
    actor_province character varying(100),
    team_id character varying(50),
    entity_type character varying(30) NOT NULL,
    entity_id character varying(50) NOT NULL,
    old_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    new_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address character varying(64),
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    request_id character varying(64)
);


--
-- Name: football_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.football_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: football_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.football_audit_log_id_seq OWNED BY public.football_audit_log.id;


--
-- Name: football_category_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_category_audit (
    id uuid NOT NULL,
    enrollment_id uuid,
    actor text NOT NULL,
    action text NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: football_category_enrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_category_enrollment (
    id uuid NOT NULL,
    team_id character varying(50) NOT NULL,
    season_key text NOT NULL,
    division_code text NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: football_category_official; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_category_official (
    enrollment_id uuid NOT NULL,
    official_id character varying(50) NOT NULL,
    role text NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: football_category_player; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_category_player (
    enrollment_id uuid NOT NULL,
    player_id character varying(50) NOT NULL,
    jersey_no integer NOT NULL,
    review_status text DEFAULT 'PENDING'::text NOT NULL,
    remarks text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT football_category_player_jersey_no_check CHECK (((jersey_no >= 1) AND (jersey_no <= 99))),
    CONSTRAINT football_category_player_review_status_check CHECK ((review_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'ACTION_REQUIRED'::text, 'REJECTED'::text])))
);


--
-- Name: football_competition_bracket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_competition_bracket (
    id bigint NOT NULL,
    category character varying(3) NOT NULL,
    province character varying(100) NOT NULL,
    district character varying(100) NOT NULL,
    bracket jsonb NOT NULL,
    created_by character varying(100) NOT NULL,
    updated_by character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT football_competition_bracket_category_check CHECK (((category)::text = ANY (ARRAY[('U14'::character varying)::text, ('U16'::character varying)::text, ('U18'::character varying)::text])))
);


--
-- Name: football_competition_bracket_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.football_competition_bracket_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: football_competition_bracket_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.football_competition_bracket_id_seq OWNED BY public.football_competition_bracket.id;


--
-- Name: football_district_draw_setup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_district_draw_setup (
    season character varying(20) NOT NULL,
    category character varying(3) NOT NULL,
    province character varying(100) NOT NULL,
    district character varying(100) NOT NULL,
    team_snapshot jsonb NOT NULL,
    team_count integer NOT NULL,
    updated_by character varying(150) NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT football_district_draw_setup_category_check CHECK (((category)::text = ANY (ARRAY[('U14'::character varying)::text, ('U16'::character varying)::text, ('U18'::character varying)::text]))),
    CONSTRAINT football_district_draw_setup_team_count_check CHECK ((team_count >= 0))
);


--
-- Name: football_district_draw_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_district_draw_version (
    id uuid NOT NULL,
    season character varying(20) NOT NULL,
    category character varying(3) NOT NULL,
    province character varying(100) NOT NULL,
    district character varying(100) NOT NULL,
    version_number integer NOT NULL,
    team_snapshot jsonb NOT NULL,
    draw_result jsonb NOT NULL,
    created_by character varying(150) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    result_status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    published_at timestamp with time zone,
    published_by character varying(150),
    CONSTRAINT football_district_draw_version_category_check CHECK (((category)::text = ANY (ARRAY[('U14'::character varying)::text, ('U16'::character varying)::text, ('U18'::character varying)::text])))
);


--
-- Name: football_official; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_official (
    id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    "position" character varying(100) NOT NULL,
    phone character varying(50) NOT NULL,
    photo_url character varying(500),
    doc_status character varying(50) DEFAULT 'APPROVED'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    team_id character varying(50),
    id_card character varying(20),
    email character varying(100),
    categories character varying(100),
    has_license character varying(10) DEFAULT 'NO'::character varying,
    license_type character varying(100),
    license_serial character varying(100),
    doc_id_card character varying(255)
);


--
-- Name: football_password_reset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_password_reset (
    id character varying(50) NOT NULL,
    email character varying(100),
    username character varying(50),
    token character varying(255),
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: football_player; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_player (
    id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    id_card character varying(50) NOT NULL,
    jersey_no integer NOT NULL,
    "position" character varying(50) NOT NULL,
    category character varying(20) NOT NULL,
    photo_url character varying(500),
    doc_url character varying(500),
    doc_status character varying(50) DEFAULT 'PENDING'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    team_id character varying(50),
    doc_id_card character varying(255),
    doc_school_cert character varying(255),
    doc_parent_consent character varying(255),
    prefix character varying(50),
    first_name character varying(100),
    middle_name character varying(100),
    last_name character varying(100),
    jersey_name character varying(100),
    birth_date character varying(50),
    fivb_id character varying(50),
    domicile character varying(100),
    height character varying(20),
    weight character varying(20),
    school character varying(150),
    grade character varying(50),
    guardian_name character varying(100),
    phone character varying(50),
    doc_team_cert character varying(255),
    doc_roster character varying(255),
    guardian_relation character varying(100),
    remarks text
);


--
-- Name: football_player_ai_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_player_ai_verification (
    id uuid NOT NULL,
    player_id text NOT NULL,
    source_hash character(64) NOT NULL,
    state text NOT NULL,
    result jsonb,
    error_code text,
    review jsonb,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT football_player_ai_verification_state_check CHECK ((state = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text])))
);


--
-- Name: football_player_ocr_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_player_ocr_cache (
    cache_key character(64) NOT NULL,
    state text NOT NULL,
    lease_id uuid,
    analysis jsonb,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT football_player_ocr_cache_state_check CHECK ((state = ANY (ARRAY['RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text])))
);


--
-- Name: football_player_ocr_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_player_ocr_usage (
    id uuid NOT NULL,
    budget_id character varying(80) NOT NULL,
    cache_key character(64) NOT NULL,
    page_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT football_player_ocr_usage_page_count_check CHECK (((page_count > 0) AND (page_count <= 4)))
);


--
-- Name: football_registered_team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_registered_team (
    id character varying(50) NOT NULL,
    team_name character varying(255) NOT NULL,
    province character varying(100) NOT NULL,
    manager_name character varying(255) NOT NULL,
    phone character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'PENDING'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    school_code character varying(50),
    district character varying(100),
    gender character varying(20),
    email character varying(100),
    line_id character varying(100),
    house_no character varying(50),
    road character varying(100),
    subdistrict character varying(100),
    contact_district character varying(100),
    contact_province character varying(100),
    username character varying(50),
    password character varying(100),
    categories character varying(100),
    reject_reason text,
    doc_team_cert character varying(255),
    doc_roster character varying(255),
    bkk_zone character varying(100),
    submitted_categories character varying(255) DEFAULT ''::character varying,
    cancelled_categories character varying(255) DEFAULT ''::character varying,
    is_test boolean DEFAULT false NOT NULL,
    contact_subdistrict character varying(100),
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    logo_url character varying(255)
);


--
-- Name: football_registration_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_registration_category (
    season_key text NOT NULL,
    division_code text NOT NULL,
    p2_season_id uuid,
    label text NOT NULL,
    birth_from date NOT NULL,
    birth_until date NOT NULL,
    opens_at timestamp with time zone NOT NULL,
    closes_at timestamp with time zone,
    dev_open boolean DEFAULT false NOT NULL,
    first_scope text DEFAULT 'PROVINCE'::text NOT NULL,
    draw_format text,
    team_limit integer,
    CONSTRAINT football_registration_category_check CHECK ((birth_until >= birth_from)),
    CONSTRAINT football_registration_category_check1 CHECK (((closes_at IS NULL) OR (closes_at > opens_at))),
    CONSTRAINT football_registration_category_division_code_check CHECK ((division_code = 'U18_GIRL'::text)),
    CONSTRAINT football_registration_category_draw_format_check CHECK ((draw_format = ANY (ARRAY['KNOCKOUT'::text, 'ROUND_ROBIN'::text]))),
    CONSTRAINT football_registration_category_first_scope_check CHECK ((first_scope = 'PROVINCE'::text)),
    CONSTRAINT football_registration_category_team_limit_check CHECK ((team_limit > 0))
);


--
-- Name: football_registration_team_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_registration_team_details (
    team_id character varying(50) NOT NULL,
    office_phone character varying(50) DEFAULT ''::character varying NOT NULL,
    village character varying(100) DEFAULT ''::character varying NOT NULL,
    postal_code character varying(5) DEFAULT ''::character varying NOT NULL
);


--
-- Name: football_support_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_support_report (
    id character varying(50) NOT NULL,
    reporter_user_id character varying(100),
    reporter_username character varying(150),
    reporter_name character varying(150) NOT NULL,
    reporter_role character varying(50) NOT NULL,
    team_id character varying(50),
    province character varying(100),
    page_description character varying(200) NOT NULL,
    page_path text NOT NULL,
    description text NOT NULL,
    status character varying(30) DEFAULT 'OPEN'::character varying NOT NULL,
    priority character varying(30) DEFAULT 'NORMAL'::character varying NOT NULL,
    category character varying(100),
    assigned_to character varying(100),
    resolution_notes text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    additional_info text
);


--
-- Name: football_support_report_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_support_report_attachment (
    id character varying(50) NOT NULL,
    report_id character varying(50) NOT NULL,
    original_filename character varying(255) NOT NULL,
    storage_name character varying(100) NOT NULL,
    mime_type character varying(100) NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT football_support_report_attachment_byte_size_check CHECK (((byte_size > 0) AND (byte_size <= 4194304)))
);


--
-- Name: football_support_report_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_support_report_message (
    id bigint NOT NULL,
    report_id character varying(50) NOT NULL,
    sender_user_id character varying(100),
    sender_name character varying(150) NOT NULL,
    sender_role character varying(50) NOT NULL,
    sender_type character varying(20) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT football_support_report_message_sender_type_check CHECK (((sender_type)::text = ANY (ARRAY[('USER'::character varying)::text, ('ADMIN'::character varying)::text])))
);


--
-- Name: football_support_report_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.football_support_report_message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: football_support_report_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.football_support_report_message_id_seq OWNED BY public.football_support_report_message.id;


--
-- Name: football_team_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_team_profile (
    id character varying(50) DEFAULT 'default'::character varying NOT NULL,
    school character varying(255) DEFAULT 'โรงเรียนกรุงเทพคริสเตียนวิทยาลัย'::character varying NOT NULL,
    school_code character varying(100) DEFAULT '1050012345'::character varying,
    province character varying(100) DEFAULT 'กรุงเทพมหานคร'::character varying NOT NULL,
    district character varying(100) DEFAULT 'บางรัก'::character varying,
    gender character varying(20) DEFAULT 'boy'::character varying,
    manager_name character varying(255) DEFAULT 'นายสมชาย เข็มกลัด'::character varying NOT NULL,
    email character varying(255) DEFAULT 'somchai@example.com'::character varying,
    phone character varying(50) DEFAULT '0812345678'::character varying NOT NULL,
    line_id character varying(100) DEFAULT 'coach_somchai'::character varying,
    house_no character varying(100) DEFAULT '393'::character varying,
    road character varying(100) DEFAULT 'ถนนประมวญ'::character varying,
    subdistrict character varying(100) DEFAULT 'สีลม'::character varying,
    contact_district character varying(100) DEFAULT 'บางรัก'::character varying,
    contact_province character varying(100) DEFAULT 'กรุงเทพมหานคร'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    categories character varying(100),
    bkk_zone character varying(100),
    doc_roster character varying(255),
    doc_team_cert character varying(255)
);


--
-- Name: football_team_registration_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.football_team_registration_document (
    id bigint NOT NULL,
    team_id character varying(50) NOT NULL,
    document_type character varying(30) NOT NULL,
    file_url character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT football_team_registration_document_document_type_check CHECK (((document_type)::text = ANY (ARRAY[('team_cert'::character varying)::text, ('roster'::character varying)::text])))
);


--
-- Name: football_team_registration_document_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.football_team_registration_document_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: football_team_registration_document_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.football_team_registration_document_id_seq OWNED BY public.football_team_registration_document.id;


--
-- Name: p2_advancement_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_advancement_request (
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    roster_revision_id uuid NOT NULL
);


--
-- Name: p2_advancement_source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_advancement_source (
    roster_revision_id uuid NOT NULL,
    target_competition_id uuid NOT NULL,
    source_competition_id uuid NOT NULL,
    event_id uuid NOT NULL,
    division_id uuid NOT NULL,
    source_draw_id uuid NOT NULL,
    qualification_revision_id uuid NOT NULL,
    source_team_id text NOT NULL,
    rank integer NOT NULL,
    CONSTRAINT p2_advancement_source_rank_check CHECK ((rank > 0))
);


--
-- Name: p2_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_audit_log (
    id bigint NOT NULL,
    event_id uuid NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    request_id uuid NOT NULL,
    new_state jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: p2_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.p2_audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.p2_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: p2_competition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_competition (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    division_id uuid NOT NULL,
    stage integer NOT NULL,
    province text,
    district text,
    zone text,
    area_key text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    roster_revision_id uuid,
    draw_version_id uuid,
    qualification_revision_id uuid,
    created_by text NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    scope_level text GENERATED ALWAYS AS (
CASE
    WHEN ((stage = 1) AND (district IS NOT NULL)) THEN 'DISTRICT'::text
    WHEN (stage = ANY (ARRAY[1, 2])) THEN 'PROVINCE'::text
    WHEN (stage = 3) THEN 'ZONE'::text
    ELSE 'NATIONAL'::text
END) STORED,
    CONSTRAINT p2_competition_area_scope_v101 CHECK ((((stage = 1) AND (province IS NOT NULL) AND (zone IS NULL)) OR ((stage = 2) AND (province IS NOT NULL) AND (district IS NULL) AND (zone IS NULL)) OR ((stage = 3) AND (province IS NULL) AND (district IS NULL) AND (zone IS NOT NULL)) OR ((stage = 4) AND (province IS NULL) AND (district IS NULL) AND (zone IS NULL)))),
    CONSTRAINT p2_competition_stage_check CHECK (((stage >= 1) AND (stage <= 4))),
    CONSTRAINT p2_competition_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'COMPLETED'::text, 'ARCHIVED'::text])))
);


--
-- Name: p2_competition_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_competition_assignment (
    competition_id uuid NOT NULL,
    actor_id text NOT NULL,
    actor_role text NOT NULL,
    permissions jsonb NOT NULL,
    active boolean NOT NULL,
    version integer NOT NULL,
    last_request_id uuid NOT NULL,
    last_request_hash text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_competition_assignment_actor_role_check CHECK ((actor_role = ANY (ARRAY['DOCUMENT_VERIFIER'::text, 'SAT_OFFICER'::text]))),
    CONSTRAINT p2_competition_assignment_permissions_check CHECK ((jsonb_typeof(permissions) = 'array'::text)),
    CONSTRAINT p2_competition_assignment_version_check CHECK ((version > 0))
);


--
-- Name: p2_draw_publication; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_draw_publication (
    draw_id uuid NOT NULL,
    actor_id text NOT NULL,
    published_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: p2_draw_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_draw_request (
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    draw_id uuid NOT NULL
);


--
-- Name: p2_draw_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_draw_version (
    id uuid NOT NULL,
    competition_id uuid NOT NULL,
    roster_revision_id uuid NOT NULL,
    version integer NOT NULL,
    algorithm_version text NOT NULL,
    slots jsonb NOT NULL,
    fixtures jsonb NOT NULL,
    automatic_qualifiers jsonb NOT NULL,
    actor_id text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_draw_version_version_check CHECK ((version > 0))
);


--
-- Name: p2_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_event (
    id uuid NOT NULL,
    season_id uuid NOT NULL,
    template_version_id text NOT NULL,
    name text NOT NULL,
    is_test boolean NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    config_snapshot jsonb NOT NULL,
    rule_version_id uuid,
    created_by text NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_event_check CHECK ((end_date >= start_date)),
    CONSTRAINT p2_event_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 200))),
    CONSTRAINT p2_event_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'CLOSED'::text, 'ARCHIVED'::text])))
);


--
-- Name: p2_event_division; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_event_division (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    code text NOT NULL,
    CONSTRAINT p2_event_division_code_check CHECK ((code = ANY (ARRAY['U14_BOY'::text, 'U16_BOY'::text, 'U18_BOY'::text, 'U18_GIRL'::text])))
);


--
-- Name: p2_lineup_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_lineup_revision (
    id uuid NOT NULL,
    match_id uuid NOT NULL,
    team_id text NOT NULL,
    version integer NOT NULL,
    state text NOT NULL,
    roster_revision_id uuid NOT NULL,
    rule_version_id uuid NOT NULL,
    players jsonb NOT NULL,
    actor_id text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_lineup_revision_state_check CHECK ((state = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text]))),
    CONSTRAINT p2_lineup_revision_version_check CHECK ((version > 0))
);


--
-- Name: p2_match; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_match (
    id uuid NOT NULL,
    competition_id uuid NOT NULL,
    draw_id uuid NOT NULL,
    number integer NOT NULL,
    round integer NOT NULL,
    side_a jsonb NOT NULL,
    side_b jsonb NOT NULL,
    venue_id uuid,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    started_at timestamp with time zone,
    state text DEFAULT 'UNSCHEDULED'::text NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    confirmed_result_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_match_check CHECK ((scheduled_end > scheduled_start)),
    CONSTRAINT p2_match_number_check CHECK ((number > 0)),
    CONSTRAINT p2_match_round_check CHECK ((round > 0)),
    CONSTRAINT p2_match_state_check CHECK ((state = ANY (ARRAY['UNSCHEDULED'::text, 'SCHEDULED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'POSTPONED'::text, 'CANCELLED'::text]))),
    CONSTRAINT p2_match_version_check CHECK ((version >= 0))
);


--
-- Name: p2_match_change; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_match_change (
    id uuid NOT NULL,
    match_id uuid NOT NULL,
    version integer NOT NULL,
    operation text NOT NULL,
    reason text NOT NULL,
    actor_id text NOT NULL,
    snapshot jsonb NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: p2_platform_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_platform_audit (
    id bigint NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    request_id uuid NOT NULL,
    new_state jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: p2_platform_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.p2_platform_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.p2_platform_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: p2_qualification_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_qualification_revision (
    id uuid NOT NULL,
    competition_id uuid NOT NULL,
    draw_id uuid NOT NULL,
    result_id uuid NOT NULL,
    teams jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: p2_result_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_result_revision (
    id uuid NOT NULL,
    match_id uuid NOT NULL,
    version integer NOT NULL,
    state text NOT NULL,
    rule_version_id uuid NOT NULL,
    result jsonb NOT NULL,
    actor_id text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_result_revision_state_check CHECK ((state = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text]))),
    CONSTRAINT p2_result_revision_version_check CHECK ((version > 0))
);


--
-- Name: p2_roster_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_roster_revision (
    id uuid NOT NULL,
    competition_id uuid NOT NULL,
    version integer NOT NULL,
    teams jsonb NOT NULL,
    fingerprint text NOT NULL,
    locked boolean NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_roster_revision_teams_check CHECK ((jsonb_typeof(teams) = 'array'::text)),
    CONSTRAINT p2_roster_revision_version_check CHECK ((version > 0))
);


--
-- Name: p2_rule_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_rule_version (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    version integer NOT NULL,
    config jsonb NOT NULL,
    actor_id text NOT NULL,
    reason text NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_rule_version_version_check CHECK ((version > 0))
);


--
-- Name: p2_season; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_season (
    id uuid NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: p2_template_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_template_version (
    id text NOT NULL,
    config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT p2_template_version_config_check CHECK ((jsonb_typeof(config) = 'object'::text))
);


--
-- Name: p2_venue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.p2_venue (
    id uuid NOT NULL,
    name text NOT NULL,
    province text NOT NULL,
    district text NOT NULL,
    created_by text NOT NULL,
    request_id uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sat_officers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_officers (
    id character varying(50) NOT NULL,
    fullname character varying(100) NOT NULL,
    "position" character varying(150) NOT NULL,
    province character varying(100) NOT NULL,
    phone character varying(50),
    email character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    password_hash character varying(255),
    line_id character varying(100)
);


--
-- Name: football_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_audit_log ALTER COLUMN id SET DEFAULT nextval('public.football_audit_log_id_seq'::regclass);


--
-- Name: football_competition_bracket id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_competition_bracket ALTER COLUMN id SET DEFAULT nextval('public.football_competition_bracket_id_seq'::regclass);


--
-- Name: football_support_report_message id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report_message ALTER COLUMN id SET DEFAULT nextval('public.football_support_report_message_id_seq'::regclass);


--
-- Name: football_team_registration_document id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_team_registration_document ALTER COLUMN id SET DEFAULT nextval('public.football_team_registration_document_id_seq'::regclass);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: football_audit_log football_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_audit_log
    ADD CONSTRAINT football_audit_log_pkey PRIMARY KEY (id);


--
-- Name: football_category_audit football_category_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_audit
    ADD CONSTRAINT football_category_audit_pkey PRIMARY KEY (id);


--
-- Name: football_category_enrollment football_category_enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_enrollment
    ADD CONSTRAINT football_category_enrollment_pkey PRIMARY KEY (id);


--
-- Name: football_category_enrollment football_category_enrollment_team_id_season_key_division_co_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_enrollment
    ADD CONSTRAINT football_category_enrollment_team_id_season_key_division_co_key UNIQUE (team_id, season_key, division_code);


--
-- Name: football_category_official football_category_official_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_official
    ADD CONSTRAINT football_category_official_pkey PRIMARY KEY (enrollment_id, official_id);


--
-- Name: football_category_player football_category_player_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_player
    ADD CONSTRAINT football_category_player_pkey PRIMARY KEY (enrollment_id, player_id);


--
-- Name: football_competition_bracket football_competition_bracket_category_province_district_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_competition_bracket
    ADD CONSTRAINT football_competition_bracket_category_province_district_key UNIQUE (category, province, district);


--
-- Name: football_competition_bracket football_competition_bracket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_competition_bracket
    ADD CONSTRAINT football_competition_bracket_pkey PRIMARY KEY (id);


--
-- Name: football_district_draw_setup football_district_draw_setup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_district_draw_setup
    ADD CONSTRAINT football_district_draw_setup_pkey PRIMARY KEY (season, category, province, district);


--
-- Name: football_district_draw_version football_district_draw_versio_season_category_province_dist_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_district_draw_version
    ADD CONSTRAINT football_district_draw_versio_season_category_province_dist_key UNIQUE (season, category, province, district, version_number);


--
-- Name: football_district_draw_version football_district_draw_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_district_draw_version
    ADD CONSTRAINT football_district_draw_version_pkey PRIMARY KEY (id);


--
-- Name: football_official football_official_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_official
    ADD CONSTRAINT football_official_pkey PRIMARY KEY (id);


--
-- Name: football_password_reset football_password_reset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_password_reset
    ADD CONSTRAINT football_password_reset_pkey PRIMARY KEY (id);


--
-- Name: football_password_reset football_password_reset_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_password_reset
    ADD CONSTRAINT football_password_reset_token_key UNIQUE (token);


--
-- Name: football_player_ai_verification football_player_ai_verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_player_ai_verification
    ADD CONSTRAINT football_player_ai_verification_pkey PRIMARY KEY (id);


--
-- Name: football_player_ocr_cache football_player_ocr_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_player_ocr_cache
    ADD CONSTRAINT football_player_ocr_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: football_player_ocr_usage football_player_ocr_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_player_ocr_usage
    ADD CONSTRAINT football_player_ocr_usage_pkey PRIMARY KEY (id);


--
-- Name: football_player football_player_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_player
    ADD CONSTRAINT football_player_pkey PRIMARY KEY (id);


--
-- Name: football_registered_team football_registered_team_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_registered_team
    ADD CONSTRAINT football_registered_team_pkey PRIMARY KEY (id);


--
-- Name: football_registration_category football_registration_category_p2_season_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_registration_category
    ADD CONSTRAINT football_registration_category_p2_season_id_key UNIQUE (p2_season_id);


--
-- Name: football_registration_category football_registration_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_registration_category
    ADD CONSTRAINT football_registration_category_pkey PRIMARY KEY (season_key, division_code);


--
-- Name: football_registration_team_details football_registration_team_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_registration_team_details
    ADD CONSTRAINT football_registration_team_details_pkey PRIMARY KEY (team_id);


--
-- Name: football_support_report_attachment football_support_report_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report_attachment
    ADD CONSTRAINT football_support_report_attachment_pkey PRIMARY KEY (id);


--
-- Name: football_support_report_attachment football_support_report_attachment_storage_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report_attachment
    ADD CONSTRAINT football_support_report_attachment_storage_name_key UNIQUE (storage_name);


--
-- Name: football_support_report_message football_support_report_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report_message
    ADD CONSTRAINT football_support_report_message_pkey PRIMARY KEY (id);


--
-- Name: football_support_report football_support_report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report
    ADD CONSTRAINT football_support_report_pkey PRIMARY KEY (id);


--
-- Name: football_team_profile football_team_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_team_profile
    ADD CONSTRAINT football_team_profile_pkey PRIMARY KEY (id);


--
-- Name: football_team_registration_document football_team_registration_do_team_id_document_type_file_ur_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_team_registration_document
    ADD CONSTRAINT football_team_registration_do_team_id_document_type_file_ur_key UNIQUE (team_id, document_type, file_url);


--
-- Name: football_team_registration_document football_team_registration_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_team_registration_document
    ADD CONSTRAINT football_team_registration_document_pkey PRIMARY KEY (id);


--
-- Name: p2_advancement_request p2_advancement_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_request
    ADD CONSTRAINT p2_advancement_request_pkey PRIMARY KEY (request_id);


--
-- Name: p2_advancement_source p2_advancement_source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_pkey PRIMARY KEY (roster_revision_id, source_team_id);


--
-- Name: p2_advancement_source p2_advancement_source_roster_revision_id_source_competition_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_roster_revision_id_source_competition_key UNIQUE (roster_revision_id, source_competition_id, rank);


--
-- Name: p2_audit_log p2_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_audit_log
    ADD CONSTRAINT p2_audit_log_pkey PRIMARY KEY (id);


--
-- Name: p2_competition_assignment p2_competition_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition_assignment
    ADD CONSTRAINT p2_competition_assignment_pkey PRIMARY KEY (competition_id, actor_id, actor_role);


--
-- Name: p2_competition p2_competition_event_id_division_id_stage_area_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_event_id_division_id_stage_area_key_key UNIQUE (event_id, division_id, stage, area_key);


--
-- Name: p2_competition p2_competition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_pkey PRIMARY KEY (id);


--
-- Name: p2_competition p2_competition_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_request_id_key UNIQUE (request_id);


--
-- Name: p2_draw_publication p2_draw_publication_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_publication
    ADD CONSTRAINT p2_draw_publication_pkey PRIMARY KEY (draw_id);


--
-- Name: p2_draw_request p2_draw_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_request
    ADD CONSTRAINT p2_draw_request_pkey PRIMARY KEY (request_id);


--
-- Name: p2_draw_version p2_draw_version_competition_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_version
    ADD CONSTRAINT p2_draw_version_competition_id_version_key UNIQUE (competition_id, version);


--
-- Name: p2_draw_version p2_draw_version_id_competition_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_version
    ADD CONSTRAINT p2_draw_version_id_competition_id_key UNIQUE (id, competition_id);


--
-- Name: p2_draw_version p2_draw_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_version
    ADD CONSTRAINT p2_draw_version_pkey PRIMARY KEY (id);


--
-- Name: p2_event_division p2_event_division_event_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event_division
    ADD CONSTRAINT p2_event_division_event_id_code_key UNIQUE (event_id, code);


--
-- Name: p2_event_division p2_event_division_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event_division
    ADD CONSTRAINT p2_event_division_id_event_id_key UNIQUE (id, event_id);


--
-- Name: p2_event_division p2_event_division_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event_division
    ADD CONSTRAINT p2_event_division_pkey PRIMARY KEY (id);


--
-- Name: p2_event p2_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event
    ADD CONSTRAINT p2_event_pkey PRIMARY KEY (id);


--
-- Name: p2_event p2_event_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event
    ADD CONSTRAINT p2_event_request_id_key UNIQUE (request_id);


--
-- Name: p2_lineup_revision p2_lineup_revision_match_id_team_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_lineup_revision
    ADD CONSTRAINT p2_lineup_revision_match_id_team_id_version_key UNIQUE (match_id, team_id, version);


--
-- Name: p2_lineup_revision p2_lineup_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_lineup_revision
    ADD CONSTRAINT p2_lineup_revision_pkey PRIMARY KEY (id);


--
-- Name: p2_match_change p2_match_change_match_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match_change
    ADD CONSTRAINT p2_match_change_match_id_version_key UNIQUE (match_id, version);


--
-- Name: p2_match_change p2_match_change_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match_change
    ADD CONSTRAINT p2_match_change_pkey PRIMARY KEY (id);


--
-- Name: p2_match_change p2_match_change_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match_change
    ADD CONSTRAINT p2_match_change_request_id_key UNIQUE (request_id);


--
-- Name: p2_match p2_match_draw_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match
    ADD CONSTRAINT p2_match_draw_id_number_key UNIQUE (draw_id, number);


--
-- Name: p2_match p2_match_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match
    ADD CONSTRAINT p2_match_pkey PRIMARY KEY (id);


--
-- Name: p2_platform_audit p2_platform_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_platform_audit
    ADD CONSTRAINT p2_platform_audit_pkey PRIMARY KEY (id);


--
-- Name: p2_qualification_revision p2_qualification_revision_id_competition_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_qualification_revision
    ADD CONSTRAINT p2_qualification_revision_id_competition_id_key UNIQUE (id, competition_id);


--
-- Name: p2_qualification_revision p2_qualification_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_qualification_revision
    ADD CONSTRAINT p2_qualification_revision_pkey PRIMARY KEY (id);


--
-- Name: p2_result_revision p2_result_revision_id_match_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_result_revision
    ADD CONSTRAINT p2_result_revision_id_match_id_key UNIQUE (id, match_id);


--
-- Name: p2_result_revision p2_result_revision_match_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_result_revision
    ADD CONSTRAINT p2_result_revision_match_id_version_key UNIQUE (match_id, version);


--
-- Name: p2_result_revision p2_result_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_result_revision
    ADD CONSTRAINT p2_result_revision_pkey PRIMARY KEY (id);


--
-- Name: p2_roster_revision p2_roster_revision_competition_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_roster_revision
    ADD CONSTRAINT p2_roster_revision_competition_id_version_key UNIQUE (competition_id, version);


--
-- Name: p2_roster_revision p2_roster_revision_id_competition_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_roster_revision
    ADD CONSTRAINT p2_roster_revision_id_competition_id_key UNIQUE (id, competition_id);


--
-- Name: p2_roster_revision p2_roster_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_roster_revision
    ADD CONSTRAINT p2_roster_revision_pkey PRIMARY KEY (id);


--
-- Name: p2_roster_revision p2_roster_revision_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_roster_revision
    ADD CONSTRAINT p2_roster_revision_request_id_key UNIQUE (request_id);


--
-- Name: p2_rule_version p2_rule_version_event_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_rule_version
    ADD CONSTRAINT p2_rule_version_event_id_version_key UNIQUE (event_id, version);


--
-- Name: p2_rule_version p2_rule_version_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_rule_version
    ADD CONSTRAINT p2_rule_version_id_event_id_key UNIQUE (id, event_id);


--
-- Name: p2_rule_version p2_rule_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_rule_version
    ADD CONSTRAINT p2_rule_version_pkey PRIMARY KEY (id);


--
-- Name: p2_rule_version p2_rule_version_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_rule_version
    ADD CONSTRAINT p2_rule_version_request_id_key UNIQUE (request_id);


--
-- Name: p2_season p2_season_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_season
    ADD CONSTRAINT p2_season_label_key UNIQUE (label);


--
-- Name: p2_season p2_season_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_season
    ADD CONSTRAINT p2_season_pkey PRIMARY KEY (id);


--
-- Name: p2_template_version p2_template_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_template_version
    ADD CONSTRAINT p2_template_version_pkey PRIMARY KEY (id);


--
-- Name: p2_venue p2_venue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_venue
    ADD CONSTRAINT p2_venue_pkey PRIMARY KEY (id);


--
-- Name: p2_venue p2_venue_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_venue
    ADD CONSTRAINT p2_venue_request_id_key UNIQUE (request_id);


--
-- Name: sat_officers sat_officers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_officers
    ADD CONSTRAINT sat_officers_pkey PRIMARY KEY (id);


--
-- Name: football_category_player_jersey; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX football_category_player_jersey ON public.football_category_player USING btree (enrollment_id, jersey_no) WHERE active;


--
-- Name: football_player_ai_verification_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX football_player_ai_verification_lookup ON public.football_player_ai_verification USING btree (player_id, created_at DESC);


--
-- Name: football_player_ocr_usage_budget_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX football_player_ocr_usage_budget_time ON public.football_player_ocr_usage USING btree (budget_id, created_at);


--
-- Name: idx_football_audit_log_actor_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_audit_log_actor_created_at ON public.football_audit_log USING btree (actor_id, created_at DESC);


--
-- Name: idx_football_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_audit_log_created_at ON public.football_audit_log USING btree (created_at DESC);


--
-- Name: idx_football_audit_log_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_audit_log_request_id ON public.football_audit_log USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: idx_football_audit_log_team_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_audit_log_team_created_at ON public.football_audit_log USING btree (team_id, created_at DESC);


--
-- Name: idx_football_support_attachment_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_support_attachment_report ON public.football_support_report_attachment USING btree (report_id, created_at);


--
-- Name: idx_football_support_message_report_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_support_message_report_created_at ON public.football_support_report_message USING btree (report_id, created_at DESC, id DESC);


--
-- Name: idx_football_support_report_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_support_report_created_at ON public.football_support_report USING btree (created_at DESC);


--
-- Name: idx_football_support_report_reporter_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_support_report_reporter_created_at ON public.football_support_report USING btree (reporter_user_id, created_at DESC);


--
-- Name: idx_football_support_report_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_support_report_status_created_at ON public.football_support_report USING btree (status, created_at DESC);


--
-- Name: idx_football_support_report_team_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_support_report_team_created_at ON public.football_support_report USING btree (team_id, created_at DESC);


--
-- Name: idx_football_team_registration_document_team_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_football_team_registration_document_team_type ON public.football_team_registration_document USING btree (team_id, document_type);


--
-- Name: p2_audit_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX p2_audit_event_time ON public.p2_audit_log USING btree (event_id, created_at DESC);


--
-- Name: p2_venue_area_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX p2_venue_area_name ON public.p2_venue USING btree (province, district, lower(btrim(name)));


--
-- Name: football_official football_women_official_identity_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER football_women_official_identity_guard BEFORE UPDATE ON public.football_official FOR EACH ROW EXECUTE FUNCTION public.football_guard_women_official_identity();


--
-- Name: p2_competition football_women_province_scope_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER football_women_province_scope_guard BEFORE INSERT OR UPDATE ON public.p2_competition FOR EACH ROW EXECUTE FUNCTION public.football_guard_women_province_scope();


--
-- Name: football_category_audit football_category_audit_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_audit
    ADD CONSTRAINT football_category_audit_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.football_category_enrollment(id);


--
-- Name: football_category_enrollment football_category_enrollment_season_key_division_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_enrollment
    ADD CONSTRAINT football_category_enrollment_season_key_division_code_fkey FOREIGN KEY (season_key, division_code) REFERENCES public.football_registration_category(season_key, division_code);


--
-- Name: football_category_enrollment football_category_enrollment_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_enrollment
    ADD CONSTRAINT football_category_enrollment_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.football_registered_team(id);


--
-- Name: football_category_official football_category_official_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_official
    ADD CONSTRAINT football_category_official_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.football_category_enrollment(id);


--
-- Name: football_category_official football_category_official_official_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_official
    ADD CONSTRAINT football_category_official_official_id_fkey FOREIGN KEY (official_id) REFERENCES public.football_official(id);


--
-- Name: football_category_player football_category_player_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_player
    ADD CONSTRAINT football_category_player_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.football_category_enrollment(id);


--
-- Name: football_category_player football_category_player_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_category_player
    ADD CONSTRAINT football_category_player_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.football_player(id);


--
-- Name: football_registration_team_details football_registration_team_details_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_registration_team_details
    ADD CONSTRAINT football_registration_team_details_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.football_registered_team(id);


--
-- Name: football_support_report_attachment football_support_report_attachment_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report_attachment
    ADD CONSTRAINT football_support_report_attachment_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.football_support_report(id);


--
-- Name: football_support_report_message football_support_report_message_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_support_report_message
    ADD CONSTRAINT football_support_report_message_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.football_support_report(id);


--
-- Name: football_team_registration_document football_team_registration_document_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.football_team_registration_document
    ADD CONSTRAINT football_team_registration_document_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.football_registered_team(id) ON DELETE CASCADE;


--
-- Name: p2_advancement_request p2_advancement_request_roster_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_request
    ADD CONSTRAINT p2_advancement_request_roster_revision_id_fkey FOREIGN KEY (roster_revision_id) REFERENCES public.p2_roster_revision(id);


--
-- Name: p2_advancement_source p2_advancement_source_division_id_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_division_id_event_id_fkey FOREIGN KEY (division_id, event_id) REFERENCES public.p2_event_division(id, event_id);


--
-- Name: p2_advancement_source p2_advancement_source_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.p2_event(id);


--
-- Name: p2_advancement_source p2_advancement_source_qualification_revision_id_source_com_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_qualification_revision_id_source_com_fkey FOREIGN KEY (qualification_revision_id, source_competition_id) REFERENCES public.p2_qualification_revision(id, competition_id);


--
-- Name: p2_advancement_source p2_advancement_source_roster_revision_id_target_competitio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_roster_revision_id_target_competitio_fkey FOREIGN KEY (roster_revision_id, target_competition_id) REFERENCES public.p2_roster_revision(id, competition_id);


--
-- Name: p2_advancement_source p2_advancement_source_source_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_source_competition_id_fkey FOREIGN KEY (source_competition_id) REFERENCES public.p2_competition(id);


--
-- Name: p2_advancement_source p2_advancement_source_source_draw_id_source_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_advancement_source
    ADD CONSTRAINT p2_advancement_source_source_draw_id_source_competition_id_fkey FOREIGN KEY (source_draw_id, source_competition_id) REFERENCES public.p2_draw_version(id, competition_id);


--
-- Name: p2_audit_log p2_audit_log_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_audit_log
    ADD CONSTRAINT p2_audit_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.p2_event(id);


--
-- Name: p2_competition_assignment p2_competition_assignment_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition_assignment
    ADD CONSTRAINT p2_competition_assignment_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.p2_competition(id);


--
-- Name: p2_competition p2_competition_division_id_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_division_id_event_id_fkey FOREIGN KEY (division_id, event_id) REFERENCES public.p2_event_division(id, event_id);


--
-- Name: p2_competition p2_competition_draw_version_id_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_draw_version_id_id_fkey FOREIGN KEY (draw_version_id, id) REFERENCES public.p2_draw_version(id, competition_id);


--
-- Name: p2_competition p2_competition_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.p2_event(id);


--
-- Name: p2_competition p2_competition_qualification_revision_id_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_qualification_revision_id_id_fkey FOREIGN KEY (qualification_revision_id, id) REFERENCES public.p2_qualification_revision(id, competition_id);


--
-- Name: p2_competition p2_competition_roster_revision_id_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_competition
    ADD CONSTRAINT p2_competition_roster_revision_id_id_fkey FOREIGN KEY (roster_revision_id, id) REFERENCES public.p2_roster_revision(id, competition_id);


--
-- Name: p2_draw_publication p2_draw_publication_draw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_publication
    ADD CONSTRAINT p2_draw_publication_draw_id_fkey FOREIGN KEY (draw_id) REFERENCES public.p2_draw_version(id);


--
-- Name: p2_draw_request p2_draw_request_draw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_request
    ADD CONSTRAINT p2_draw_request_draw_id_fkey FOREIGN KEY (draw_id) REFERENCES public.p2_draw_version(id);


--
-- Name: p2_draw_version p2_draw_version_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_version
    ADD CONSTRAINT p2_draw_version_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.p2_competition(id);


--
-- Name: p2_draw_version p2_draw_version_roster_revision_id_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_draw_version
    ADD CONSTRAINT p2_draw_version_roster_revision_id_competition_id_fkey FOREIGN KEY (roster_revision_id, competition_id) REFERENCES public.p2_roster_revision(id, competition_id);


--
-- Name: p2_event_division p2_event_division_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event_division
    ADD CONSTRAINT p2_event_division_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.p2_event(id);


--
-- Name: p2_event p2_event_rule_version_id_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event
    ADD CONSTRAINT p2_event_rule_version_id_id_fkey FOREIGN KEY (rule_version_id, id) REFERENCES public.p2_rule_version(id, event_id);


--
-- Name: p2_event p2_event_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event
    ADD CONSTRAINT p2_event_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.p2_season(id);


--
-- Name: p2_event p2_event_template_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_event
    ADD CONSTRAINT p2_event_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES public.p2_template_version(id);


--
-- Name: p2_lineup_revision p2_lineup_revision_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_lineup_revision
    ADD CONSTRAINT p2_lineup_revision_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.p2_match(id);


--
-- Name: p2_lineup_revision p2_lineup_revision_roster_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_lineup_revision
    ADD CONSTRAINT p2_lineup_revision_roster_revision_id_fkey FOREIGN KEY (roster_revision_id) REFERENCES public.p2_roster_revision(id);


--
-- Name: p2_lineup_revision p2_lineup_revision_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_lineup_revision
    ADD CONSTRAINT p2_lineup_revision_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES public.p2_rule_version(id);


--
-- Name: p2_match_change p2_match_change_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match_change
    ADD CONSTRAINT p2_match_change_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.p2_match(id);


--
-- Name: p2_match p2_match_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match
    ADD CONSTRAINT p2_match_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.p2_competition(id);


--
-- Name: p2_match p2_match_confirmed_result_id_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match
    ADD CONSTRAINT p2_match_confirmed_result_id_id_fkey FOREIGN KEY (confirmed_result_id, id) REFERENCES public.p2_result_revision(id, match_id);


--
-- Name: p2_match p2_match_draw_id_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match
    ADD CONSTRAINT p2_match_draw_id_competition_id_fkey FOREIGN KEY (draw_id, competition_id) REFERENCES public.p2_draw_version(id, competition_id);


--
-- Name: p2_match p2_match_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_match
    ADD CONSTRAINT p2_match_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.p2_venue(id);


--
-- Name: p2_qualification_revision p2_qualification_revision_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_qualification_revision
    ADD CONSTRAINT p2_qualification_revision_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.p2_competition(id);


--
-- Name: p2_qualification_revision p2_qualification_revision_draw_id_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_qualification_revision
    ADD CONSTRAINT p2_qualification_revision_draw_id_competition_id_fkey FOREIGN KEY (draw_id, competition_id) REFERENCES public.p2_draw_version(id, competition_id);


--
-- Name: p2_qualification_revision p2_qualification_revision_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_qualification_revision
    ADD CONSTRAINT p2_qualification_revision_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.p2_result_revision(id);


--
-- Name: p2_result_revision p2_result_revision_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_result_revision
    ADD CONSTRAINT p2_result_revision_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.p2_match(id);


--
-- Name: p2_result_revision p2_result_revision_rule_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_result_revision
    ADD CONSTRAINT p2_result_revision_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES public.p2_rule_version(id);


--
-- Name: p2_roster_revision p2_roster_revision_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_roster_revision
    ADD CONSTRAINT p2_roster_revision_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.p2_competition(id);


--
-- Name: p2_rule_version p2_rule_version_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.p2_rule_version
    ADD CONSTRAINT p2_rule_version_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.p2_event(id);


--
-- PostgreSQL database dump complete
--

\unrestrict ed3KgKC2PT4CR6NfoG3EKodbXBNzgj1MlxcgM2J7OVbmf2hOODDQrPYdb1AhROa

