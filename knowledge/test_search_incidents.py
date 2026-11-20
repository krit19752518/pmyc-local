"""Regression checks for the offline Football incident retriever."""

import json
from pathlib import Path
import subprocess
import sys
import unittest


KNOWLEDGE_DIR = Path(__file__).resolve().parent
RETRIEVER = KNOWLEDGE_DIR / "search_incidents.py"


class IncidentRetrieverTests(unittest.TestCase):
    def test_schedule_post_error_layout(self) -> None:
        self.assert_retrieves(
            "schedule save POST 422 409 validation conflict legacy form input saved_version transaction rollback",
            "knowledge/incident-2026-11-17-schedule-save-layout.md",
            expected_resolution="mitigated",
        )

    def test_dev_https_ceremony_post_origin(self) -> None:
        self.assert_retrieves(
            "ceremony prepare_ceremony Forbidden HTTPS POST origin reverse proxy FOOTBALL_VPS_DEV",
            "knowledge/incident-2026-11-16-dev-https-post-origin.md",
            expected_resolution="mitigated",
        )

    def test_schedule_match_detail_legacy_layout(self) -> None:
        self.assert_retrieves(
            "phase2 schedule details legacy MatchPages Application layout WorkspaceView contextual match filters",
            "knowledge/incident-2026-11-16-match-detail-layout.md",
            expected_resolution="mitigated",
        )

    def test_ceremony_named_team_balls_replay(self) -> None:
        self.assert_retrieves(
            "ceremony named team balls bracket long names ellipsis saved slots replay",
            "knowledge/incident-2026-11-13-ceremony-saved-replay.md",
            expected_resolution="mitigated",
        )

    def test_local_promotion_ignored_generated_inventory(self) -> None:
        self.assert_retrieves(
            "local promotion ignored generated files tracked inventory candidate SHA",
            "knowledge/incident-2026-11-13-local-promotion-inventory.md",
            expected_resolution="mitigated",
        )

    def test_local_promotion_raw_index_semantics(self) -> None:
        self.assert_retrieves(
            "Git index raw hash staged semantic stat cache local promotion",
            "knowledge/incident-2026-11-13-local-promotion-inventory.md",
            expected_resolution="mitigated",
        )

    def test_issue77_admin_category_active_total(self) -> None:
        self.assert_retrieves(
            "issue77 admin report-teams-categories active registrations total card cancelled categories restoration SAT province",
            "knowledge/incident-2026-11-12-public-statistics-data-contract.md",
            expected_resolution="mitigated",
        )

    def test_stream_fd_and_exact_hook_resume(self) -> None:
        self.assert_retrieves(
            "stream-fd codex-resume UserPromptSubmit exact unlock diagnostic",
            "knowledge/incident-2026-10-28-precommand-errors.md",
            expected_resolution="open",
        )

    def test_permanent_local_uat_and_residual_evidence(self) -> None:
        self.assert_retrieves(
            "permanent checkout UAT4573 residual evidence accepted revision",
            "knowledge/incident-2026-11-09-local-runtime-git-parity.md",
            expected_resolution="mitigated",
        )

    def test_issue70_cumulative_budget_and_photo_captions(self) -> None:
        self.assert_retrieves(
            "issue70 OCR_BUDGET_EXCEEDED cumulative trial quota modalPlayerName modalPlayerIdCard modalPlayerPos populateDetails",
            "knowledge/incident-2026-11-12-ocr-budget-popup-details.md",
            expected_resolution="open",
        )

    def test_dashboard_admin_province_picker(self) -> None:
        self.assert_retrieves(
            "Dashboard Admin province picker datalist prefilled current Bangkok Chiang Mai U16 Demo dropdown select",
            "knowledge/incident-2026-11-11-dashboard-province-picker.md",
            expected_resolution="mitigated",
        )

    def test_demo_area_options_not_national_master(self) -> None:
        self.assert_retrieves(
            "Demo province district options national master filtering is_test existingAreas areaIndex empty SAT hard-code",
            "knowledge/incident-2026-11-11-demo-area-options.md",
            expected_resolution="mitigated",
        )

    def test_phase1_area_first_eight_eligible_teams(self) -> None:
        self.assert_retrieves(
            "province master77 assigned SAT district first8 approved team all athletes registration created_at fewer eight eligibility source preview",
            "knowledge/incident-2026-11-11-phase1-area-eligibility.md",
            expected_resolution="mitigated",
        )

    def test_dashboard_v16_five_filters_presentation(self) -> None:
        self.assert_retrieves(
            "Dashboard v16 UX prototype five filters extra event card data mode selector hidden context presentation drift",
            "knowledge/incident-2026-11-11-dashboard-v16-presentation.md",
            expected_resolution="mitigated",
        )

    def test_dashboard_new_empty_event_false403(self) -> None:
        self.assert_retrieves(
            "Dashboard new empty event no child competition false403 Super Admin event catalog authorization Stage3 placeholder",
            "knowledge/incident-2026-11-10-dashboard-empty-event.md",
            expected_resolution="mitigated",
        )

    def test_phase2_event_confirmation_database_marker(self) -> None:
        self.assert_retrieves(
            "phase2 event preview missing save confirmation database-enabled marker creationReady Local schema Phase1 team reuse",
            "knowledge/incident-2026-11-10-phase2-event-persistence.md",
            expected_resolution="mitigated",
        )

    def test_scp_actual_stage_permissions(self) -> None:
        self.assert_retrieves(
            "SCP scp -p preserves permissions mode0664 mode0644 actual build filesystem Git100644 selective staging",
            "knowledge/incident-2026-11-10-selective-stage-file-modes.md",
            expected_resolution="mitigated",
        )

    def test_prefix_free_details_compatible_cache(self) -> None:
        self.assert_retrieves(
            "prefix-free name surname detailed comparison V5 V6 compatible cache title ignored",
            "knowledge/incident-2026-11-10-ocr-prefix-free-details.md",
            expected_resolution="resolved",
        )

    def test_ocr_reader_public_uploads_fallback(self) -> None:
        self.assert_retrieves(
            "OCR document-info verification HTTP 503 ENOENT public uploads fallback",
            "knowledge/incident-2026-11-10-ocr-upload-root-fallback.md",
            expected_resolution="resolved",
        )

    def test_registration_fallback_omits_gender(self) -> None:
        self.assert_retrieves(
            "registration fallback INSERT gender NULL",
            "knowledge/incident-2026-11-09-demo-gender-discovery.md",
            expected_resolution="mitigated",
        )

    def test_standalone_git_temporary_runtime_parity(self) -> None:
        self.assert_retrieves(
            "standalone Git Local4500 temporary entry production parity",
            "knowledge/incident-2026-11-09-local-runtime-git-parity.md",
            expected_resolution="mitigated",
        )

    def test_demo_gender_null_hides_phase2_province(self) -> None:
        self.assert_retrieves(
            "RegistrationAdapter areaIndex gender NULL province",
            "knowledge/incident-2026-11-09-demo-gender-discovery.md",
            expected_resolution="mitigated",
        )

    def test_restart_http_timeout_readiness(self) -> None:
        self.assert_retrieves(
            "Passenger Node22 startup HTTP timeout smoke restart",
            "knowledge/incident-2026-11-09-startup-http-timeout.md",
            expected_resolution="mitigated",
        )

    def test_admin_area_client_initialization(self) -> None:
        self.assert_retrieves(
            "PmycTeamArea undefined getTeamDistrictName renderTeamAreaClientScript",
            "knowledge/incident-2026-11-09-admin-area-client.md",
            expected_resolution="resolved",
        )

    def test_player_review_submission_gate_all_admin_pages(self) -> None:
        self.assert_retrieves(
            "admin players status badge team submitted_categories SAT roster read-only player verification review save-remark category gating",
            "knowledge/incident-2026-11-11-player-review-submission-gate.md",
            expected_resolution="mitigated",
        )

    def run_query(self, query: str, *extra_args: str) -> dict[str, object]:
        completed = subprocess.run(
            [sys.executable, str(RETRIEVER), *extra_args, query],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(completed.stdout)

    def assert_retrieves(
        self,
        query: str,
        source: str,
        *,
        expected_status: str = "verified",
        expected_resolution: str = "open",
    ) -> None:
        result = self.run_query(query)
        self.assertEqual(result["method"], "BM25 lexical; no embeddings")
        self.assertFalse(result["abstain"])
        self.assertEqual(result["results"][0]["source"], source)
        self.assertIn("incident_id", result["results"][0])
        self.assertIn("status", result["results"][0])
        self.assertIn("resolution", result["results"][0])
        self.assertIn("excerpt", result["results"][0])
        self.assertEqual(result["results"][0]["status"], expected_status)
        self.assertEqual(result["results"][0]["resolution"], expected_resolution)

    def test_precommand_errors_retrieve_incident(self) -> None:
        self.assert_retrieves(
            "arg expected one argument",
            "knowledge/incident-2026-10-28-precommand-errors.md",
        )

    def test_recovery_card_option_like_help_error_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "pre-command card missing required helper fields --arg=--help expected one argument",
            "knowledge/incident-2026-10-28-precommand-errors.md",
        )

    def test_path_scope_errors_retrieve_incident(self) -> None:
        self.assert_retrieves(
            "uploads protected path status truncated",
            "knowledge/incident-2026-10-28-path-scope.md",
        )

    def test_assistant_tooling_errors_retrieve_incident(self) -> None:
        self.assert_retrieves(
            "wait_threads polls structuredContent output truncation",
            "knowledge/incident-2026-10-28-tooling-errors.md",
        )
        self.assert_retrieves(
            "unquoted multiword --arg shell quotes doubled newline patch output cap recovery card",
            "knowledge/incident-2026-10-28-tooling-errors.md",
        )

    def test_thai_precommand_query_retrieves_expected_incident(self) -> None:
        self.assert_retrieves(
            "การสร้างการ์ดคำสั่งผิดพลาดซ้ำ",
            "knowledge/incident-2026-10-28-precommand-errors.md",
        )

    def test_thai_path_scope_query_retrieves_expected_incident(self) -> None:
        self.assert_retrieves(
            "รายชื่อไฟล์ปรากฏจากคำสั่งตรวจสถานะ",
            "knowledge/incident-2026-10-28-path-scope.md",
        )

    def test_thai_retrieval_quality_query_retrieves_expected_incident(self) -> None:
        self.assert_retrieves(
            "การค้น incident ภาษาไทย BM25 จัดอันดับผิด",
            "knowledge/incident-2026-10-28-thai-retrieval.md",
            expected_resolution="resolved",
        )

    def test_unknown_query_abstains(self) -> None:
        result = self.run_query("zzzznevermatchtoken")
        self.assertTrue(result["abstain"])
        self.assertEqual(result["results"], [])

    def test_iapp_date_field_boundaries_retrieve_incident(self) -> None:
        self.assert_retrieves(
            "iApp plain text OCR date window birth expiry issue label confidence checksum parser",
            "knowledge/incident-2026-11-09-ocr-field-boundaries.md",
            expected_resolution="mitigated",
        )

    def test_multiline_name_prefill_expiry_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "multiline Thai name prefix surname automatic prefill Bangkok yesterday cached expiry provenance",
            "knowledge/incident-2026-11-09-ocr-name-prefill-expiry.md",
            expected_resolution="mitigated",
        )

    def test_unsupported_title_counterfactual_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "unsupported child title prefix English label-only payload parser rejects candidate offline counterfactual",
            "knowledge/incident-2026-11-10-ocr-prefix-name-rejection.md",
            expected_resolution="open",
        )

    def test_category_specific_diagnostic_scope_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "scoped record category duplicate identity private diagnostic name job binding",
            "knowledge/incident-2026-11-10-ocr-prefix-name-rejection.md",
            expected_resolution="open",
        )

    def test_release_source_runtime_drift_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "selective release source runtime drift TypeScript generated artifact candidate baseline regression",
            "knowledge/incident-2026-11-09-release-source-runtime-drift.md",
            expected_resolution="mitigated",
        )

    def test_local_postgresql_cidr_preflight_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "Local PostgreSQL CIDR inet_server_addr host DATABASE_IDENTITY_MISMATCH preflight",
            "knowledge/incident-2026-11-09-release-source-runtime-drift.md",
            expected_resolution="mitigated",
        )

    def test_review_completeness_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "player review completeness mandatory radio identity different person decisions",
            "knowledge/incident-2026-11-09-review-completeness.md",
            expected_resolution="mitigated",
        )

    def test_pending_reset_generation_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "pending reset marker cache generation cancelled late completion",
            "knowledge/incident-2026-11-09-review-completeness.md",
            expected_resolution="mitigated",
        )

    def test_ai_progress_popup_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "AI worker progress bar percentage popup polling automatic enqueue",
            "knowledge/incident-2026-11-09-ai-worker-retry.md",
            expected_resolution="mitigated",
        )

    def test_player_save_popup_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "admin players modal save status browser alert popup SweetAlert2",
            "knowledge/incident-2026-11-09-player-save-popup.md",
            expected_resolution="mitigated",
        )

    def test_ai_worker_manual_review_retry_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "AI worker unavailable connection refused local cooldown retry manual review 30 seconds",
            "knowledge/incident-2026-11-09-ai-worker-retry.md",
            expected_resolution="mitigated",
        )

    def test_sat_team_popup_script_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "SAT team inspection button inert unexpected identifier player openAdminEditTeamModal photo URL regex escaping rendered inline JavaScript",
            "knowledge/incident-2026-11-11-sat-team-popup-script.md",
            expected_resolution="mitigated",
        )

    def test_public_cumulative_statistics_data_contract(self) -> None:
        self.assert_retrieves(
            "public registration statistics cumulative cancelled FIFO district codes master zone unassigned snapshot last-good fallback memory",
            "knowledge/incident-2026-11-12-public-statistics-data-contract.md",
            expected_resolution="mitigated",
        )

    def test_public_cancellation_policy_and_snapshot_upgrade(self) -> None:
        self.assert_retrieves(
            "public report exclude cancelled_categories per age Admin cumulative snapshot definitionVersion same-day force pinned historical cron disabled",
            "knowledge/incident-2026-11-12-public-statistics-data-contract.md",
            expected_resolution="mitigated",
        )

    def test_isolated_worktree_is_not_active_local4500(self) -> None:
        self.assert_retrieves(
            "issue72 isolated worktree Local4500 missing statistics menu active launcher promotion",
            "knowledge/incident-2026-11-09-local-runtime-git-parity.md",
            expected_resolution="mitigated",
        )

    def test_issue72_accepted_source_registration(self) -> None:
        self.assert_retrieves(
            "issue72 accepted9f09966 GitHub source registration v2 cron disabled",
            "knowledge/incident-2026-11-12-public-statistics-data-contract.md",
            expected_resolution="mitigated",
        )

    def test_unrelated_thai_query_abstains(self) -> None:
        result = self.run_query("สนามฟุตบอลพรุ่งนี้ฝนตกหรือไม่")
        self.assertTrue(result["abstain"])
        self.assertEqual(result["results"], [])

    def test_invalid_top_k_fails_closed(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(RETRIEVER), "--top-k", "0", "parameter check"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("top_k must be between 1 and 10", completed.stderr)

    def test_argv_runner_followup_errors_retrieve_incident(self) -> None:
        self.assert_retrieves(
            "argv-safe precommand runner btoa ReferenceError SyntaxError Unexpected string action plan RELEASE_PLAN_BLOCKED uncertainties apply_patch empty result",
            "knowledge/incident-2026-10-28-precommand-errors.md",
        )
        self.assert_retrieves(
            "PreToolUse PostToolUse",
            "knowledge/incident-2026-10-28-precommand-errors.md",
        )

    def test_post_restart_http_evidence_freshness_retrieves_incident(self) -> None:
        self.assert_retrieves(
            "post restart HTTP timeout stale preflight result timestamp freshness readiness worker evidence",
            "knowledge/incident-2026-11-10-post-restart-http-evidence.md",
            expected_resolution="mitigated",
        )


if __name__ == "__main__":
    unittest.main()
