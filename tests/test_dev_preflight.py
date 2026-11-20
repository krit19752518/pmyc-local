import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import dev_preflight  # noqa: E402


def make_probe_output(
    *,
    git_root: str = "/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
    origin: str = "git@github.com:krit19752518/pmyc-football.git",
    branch: str = "work/issue105-test",
    cand_sha: str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    cand_tree: str = "1111111111111111111111111111111111111111",
    base_sha: str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    base_tree: str = "2222222222222222222222222222222222222222",
    status_lines: list[str] | None = None,
    passenger_app_root: str | None = "/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
    artifacts: dict[str, str] | None = None,
) -> str:
    lines = [
        "PF_BEGIN=1",
        "PF_HOST=dev-vps",
        "PF_USER=zbpzpszw",
        f"PF_GIT_ROOT={git_root}",
        f"PF_ORIGIN={origin}",
        f"PF_BRANCH={branch}",
        f"PF_CAND_SHA={cand_sha}",
        f"PF_CAND_TREE={cand_tree}",
        f"PF_BASE_SHA={base_sha}",
        f"PF_BASE_TREE={base_tree}",
        "PF_STATUS_BEGIN",
        *(status_lines or []),
        "PF_STATUS_END",
        "PF_HTACCESS_BEGIN",
    ]
    if passenger_app_root:
        lines.append(f"PassengerAppRoot {passenger_app_root}")
    lines.append("PF_HTACCESS_END")
    for k, v in (artifacts or {}).items():
        lines.append(f"WT_ART:{k}:{v}")
    lines.append("PF_END=1")
    return "\n".join(lines) + "\n"


class DevPreflightTests(unittest.TestCase):
    def test_valid_dev_candidate_passes(self):
        out = make_probe_output(artifacts={"dist/server.js": "deadbeef" * 8})
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            base_ref="origin/main",
            artifacts=["dist/server.js"],
            transport_fn=lambda _s: (0, out, ""),
        )
        self.assertTrue(res["ok"], res["errors"])
        self.assertEqual(res["preview"]["status"], "matched")
        self.assertEqual(res["artifacts"]["dist/server.js"], "deadbeef" * 8)

    def test_local_path_rejected(self):
        called = False

        def fail_if_called(_s):
            nonlocal called
            called = True
            return (0, "", "")

        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/krit/my-office/pmyc-football-work/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            transport_fn=fail_if_called,
        )
        self.assertFalse(res["ok"])
        self.assertFalse(called)
        self.assertEqual(res["errors"][0]["code"], "LOCAL_PATH_REJECTED")

    def test_wrong_origin_fails_and_sanitizes_credentials(self):
        out = make_probe_output(origin="https://secretuser:secretpass@github.com/krit19752518/gritsolution.git")
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            transport_fn=lambda _s: (0, out, ""),
        )
        self.assertFalse(res["ok"])
        codes = [e["code"] for e in res["errors"]]
        self.assertIn("WRONG_ORIGIN", codes)
        self.assertNotIn("secretpass", str(res))
        self.assertIn("***@", res["git"]["origin_sanitized"])

    def test_dev_unreachable_fails(self):
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            transport_fn=lambda _s: (255, "", "ssh: connect to host 118.27.146.15 port 9922: Connection timed out"),
        )
        self.assertFalse(res["ok"])
        self.assertEqual(res["errors"][0]["code"], "DEV_UNREACHABLE")

    def test_incomplete_transport_output_fails(self):
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            transport_fn=lambda _s: (0, "PF_BEGIN=1\nPF_HOST=dev-vps\n", ""),
        )
        self.assertFalse(res["ok"])
        self.assertEqual(res["errors"][0]["code"], "INCOMPLETE_TRANSPORT_OUTPUT")

    def test_unexplained_changes_fail_unless_allowed(self):
        out = make_probe_output(status_lines=[" M src/app.ts", "?? temp.txt"])
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            allow_paths=["src/app.ts"],
            transport_fn=lambda _s: (0, out, ""),
        )
        self.assertFalse(res["ok"])
        codes = [e["code"] for e in res["errors"]]
        self.assertIn("UNEXPLAINED_CHANGES", codes)
        self.assertEqual([e["path"] for e in res["git"]["unexplained_changes"]], ["temp.txt"])

    def test_preview_serving_different_candidate_fails(self):
        out = make_probe_output(
            git_root="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            passenger_app_root="/home/zbpzpszw/football-dev/workspace",
        )
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            transport_fn=lambda _s: (0, out, ""),
        )
        self.assertFalse(res["ok"])
        codes = [e["code"] for e in res["errors"]]
        self.assertIn("PREVIEW_MISMATCH", codes)
        self.assertEqual(res["preview"]["status"], "mismatch")

    def test_pending_preview_passes_for_new_issue(self):
        out = make_probe_output(passenger_app_root=None)
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="pending",
            base_ref="origin/main",
            transport_fn=lambda _s: (0, out, ""),
        )
        self.assertTrue(res["ok"], res["errors"])
        self.assertEqual(res["preview"]["status"], "pending")

    def test_different_sha_identical_tree_passes_and_checks_preview(self):
        same_tree = "9999999999999999999999999999999999999999"
        out = make_probe_output(
            cand_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            base_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            cand_tree=same_tree,
            base_tree=same_tree,
            passenger_app_root="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
        )
        res = dev_preflight.run_preflight(
            issue="105",
            worktree="/home/zbpzpszw/football-dev/workspace/.runtime/issue105",
            preview="https://football-dev.pmycfootball.in.th",
            base_ref="origin/main",
            transport_fn=lambda _s: (0, out, ""),
        )
        self.assertTrue(res["ok"], res["errors"])
        self.assertEqual(res["git"]["tree_parity"], "identical_tree_different_sha")
        self.assertEqual(res["preview"]["status"], "matched")


if __name__ == "__main__":
    unittest.main()
