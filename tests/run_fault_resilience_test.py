"""Automated Fault Resilience Verification for ADIM-004.

Tests two controlled fault resilience scenarios on an isolated temporary workspace:
1. Scenario A — REWORK Resilience & Auto-Recovery:
   - Initial failure (attempt 1) triggers controlled verification failure (REWORK).
   - Attempt history and recovery checkpoint are recorded without infinite looping.
   - Second attempt (attempt 2) applies correct fix within retry budget.
   - Scheduler evaluates fix, commits step, and automatically advances to dependent step.
   - Dependent step executes successfully, proving complete DAG recovery.
2. Scenario B — Terminal HOLD & Dependent Step Blocking:
   - Controlled terminal HOLD is triggered on step failure/blocker.
   - Scheduler halts loop with loop_status == "HOLD".
   - Subsequent dependent step remains PENDING and is strictly blocked from executing.
   - Exact HOLD reason is preserved in checkpoint/state without corruption.
   - No empty commit or unearned progression is created in the Git repository.
3. Host Workspace Isolation & Git Guard:
   - Host repository (LARİ workspace) is inspected before and after tests.
   - Verifies zero file pollution, zero dirty state leakage, and zero unauthorized commits on host.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

# Configure git environment to prevent CRLF warnings from cluttering stdout
os.environ["GIT_CONFIG_COUNT"] = "2"
os.environ["GIT_CONFIG_KEY_0"] = "core.autocrlf"
os.environ["GIT_CONFIG_VALUE_0"] = "false"
os.environ["GIT_CONFIG_KEY_1"] = "core.safecrlf"
os.environ["GIT_CONFIG_VALUE_1"] = "false"

# Ensure UTF-8 stdout/stderr on Windows console
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add Otonom-Proje root directory to sys.path
OTONOM_ROOT = Path(os.environ.get("AUTODEV_OTONOM_ROOT", "C:/Projects/Otonom-Proje")).resolve()
if str(OTONOM_ROOT) not in sys.path:
    sys.path.insert(0, str(OTONOM_ROOT))

SCRIPT_PARENT = Path(__file__).resolve().parent.parent
if str(SCRIPT_PARENT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_PARENT))

from loop import AutoDevLoop
from runners import AutoDevRunners, RunnerResponse, find_git_binary, run_process_with_timeout
from tests.test_autodev_smoke import init_temp_git_workspace


def get_git_info(repo_path: Path, git_bin: str) -> dict[str, Any]:
    """Retrieve HEAD SHA, commit count, and porcelain status for a repository."""
    rc_head, head_sha, _, _ = run_process_with_timeout(
        [git_bin, "rev-parse", "HEAD"],
        cwd=repo_path,
        timeout_seconds=15,
    )
    rc_stat, porcelain, _, _ = run_process_with_timeout(
        [git_bin, "status", "--porcelain"],
        cwd=repo_path,
        timeout_seconds=15,
    )
    rc_cnt, cnt_str, _, _ = run_process_with_timeout(
        [git_bin, "rev-list", "--count", "HEAD"],
        cwd=repo_path,
        timeout_seconds=15,
    )
    return {
        "head": head_sha.strip() if rc_head == 0 else "UNKNOWN",
        "status": porcelain.strip() if rc_stat == 0 else "UNKNOWN",
        "commit_count": int(cnt_str.strip()) if rc_cnt == 0 and cnt_str.strip().isdigit() else -1,
    }


def print_assertion(title: str, expected: Any, actual: Any, success: bool, extra: str = "") -> None:
    status_icon = "✅ PASS" if success else "❌ FAIL"
    print(f"    [{status_icon}] {title}")
    print(f"           Beklenen: {expected}")
    print(f"           Mevcut  : {actual}")
    if extra:
        print(f"           Detay   : {extra}")


def print_structured_telemetry(title: str, payload: dict[str, Any]) -> None:
    print(f"\n📊 [YAPILANDIRILMIŞ TELEMETRİ / JSON KANIT] {title}:")
    print("```json")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    print("```")


def run_rework_test(host_workspace: Path, git_bin: str) -> bool:
    print("\n" + "=" * 80)
    print("▶️  SENARYO A (REWORK VE OTOMATİK DÜZELME DAYANIKLILIK TESTİ)")
    print("=" * 80)

    with tempfile.TemporaryDirectory(prefix="autodev_test_rework_") as tmp_dir:
        tmp_path = Path(tmp_dir).resolve()
        print(f"[*] Geçici izole test alanı oluşturuldu: {tmp_path}")

        # Isolation check
        is_isolated = tmp_path != host_workspace and str(host_workspace) not in str(tmp_path)
        print_assertion(
            "Geçici alan izolasyonu",
            expected="Host çalışma ağacı dışında bağımsız geçici dizin",
            actual=str(tmp_path),
            success=is_isolated,
        )
        assert is_isolated, "Geçici alan host çalışma ağacından izole olmalı!"

        init_temp_git_workspace(tmp_path)
        init_info = get_git_info(tmp_path, git_bin)
        print(f"[*] Başlangıç commit'i: {init_info['head'][:8]} (Toplam commit: {init_info['commit_count']})")

        attempts_seen: list[int] = []
        writer_trace: list[dict[str, Any]] = []
        reviewer_trace: list[dict[str, Any]] = []

        def mock_writer(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
            attempts_seen.append(attempt)
            if step_id == "ADIM-001":
                if attempt == 1:
                    # Deliberately produce faulty code for attempt 1
                    target_file = tmp_path / "target.py"
                    target_file.write_text("def run(): return False\n", encoding="utf-8")
                    entry = {
                        "step_id": step_id,
                        "attempt": attempt,
                        "outcome": "OK",
                        "summary": "İlk taslak yazıldı (hatalı: return False).",
                        "code": "def run(): return False",
                    }
                    writer_trace.append(entry)
                    return RunnerResponse(
                        outcome="OK",
                        provider="AGY",
                        account_id="Hesap-1",
                        summary=entry["summary"],
                    )
                else:
                    # Fix code in attempt 2
                    target_file = tmp_path / "target.py"
                    target_file.write_text("def run(): return True\n", encoding="utf-8")
                    entry = {
                        "step_id": step_id,
                        "attempt": attempt,
                        "outcome": "OK",
                        "summary": "Hata düzeltildi (başarılı: return True).",
                        "code": "def run(): return True",
                    }
                    writer_trace.append(entry)
                    return RunnerResponse(
                        outcome="OK",
                        provider="AGY",
                        account_id="Hesap-1",
                        summary=entry["summary"],
                    )
            elif step_id == "ADIM-002":
                consumer_file = tmp_path / "consumer.py"
                consumer_file.write_text("from target import run\nassert run() is True\n", encoding="utf-8")
                entry = {
                    "step_id": step_id,
                    "attempt": attempt,
                    "outcome": "OK",
                    "summary": "Bağımlı entegrasyon kodu yazıldı.",
                    "code": "from target import run; assert run() is True",
                }
                writer_trace.append(entry)
                return RunnerResponse(
                    outcome="OK",
                    provider="AGY",
                    account_id="Hesap-1",
                    summary=entry["summary"],
                )
            return RunnerResponse(outcome="HOLD", provider="AGY", summary="Bilinmeyen adım")

        def mock_reviewer(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
            if step_id == "ADIM-001":
                content = (tmp_path / "target.py").read_text(encoding="utf-8") if (tmp_path / "target.py").is_file() else ""
                if "return True" in content:
                    resp = RunnerResponse(
                        outcome="OK",
                        provider="CODEX",
                        account_id="Codex-ReadOnly",
                        summary="Kod onaylandı: target.py run() True dönüyor.",
                        payload={"verdict": "PASS", "issues": [], "decisions_taken": ["Düzeltme onaylandı: return True doğrulandı."]},
                    )
                else:
                    resp = RunnerResponse(
                        outcome="OK",
                        provider="CODEX",
                        account_id="Codex-ReadOnly",
                        summary="Denetim başarısız: return False bulundu.",
                        payload={"verdict": "REWORK", "issues": ["target.py içinde return True bekleniyordu, return False bulundu."]},
                    )
                reviewer_trace.append({
                    "step_id": step_id,
                    "attempt": attempt,
                    "verdict": resp.payload.get("verdict"),
                    "issues": resp.payload.get("issues"),
                })
                return resp
            elif step_id == "ADIM-002":
                resp = RunnerResponse(
                    outcome="OK",
                    provider="CODEX",
                    account_id="Codex-ReadOnly",
                    summary="Bağımlı adım entegrasyonu başarıyla onaylandı.",
                    payload={"verdict": "PASS", "issues": [], "decisions_taken": ["consumer.py entegrasyonu geçerli."]},
                )
                reviewer_trace.append({
                    "step_id": step_id,
                    "attempt": attempt,
                    "verdict": resp.payload.get("verdict"),
                    "issues": resp.payload.get("issues"),
                })
                return resp
            return RunnerResponse(outcome="HOLD", provider="CODEX", summary="Bilinmeyen denetim adımı")

        loop = AutoDevLoop(root_dir=tmp_path)
        loop.runners = AutoDevRunners(
            loop.config,
            loop.workspace_path,
            mock_writer=mock_writer,
            mock_reviewer=mock_reviewer,
        )

        loop.initialize_roadmap_memory(
            project_name="FaultResilienceTest",
            roadmap_goal="REWORK Resilience Test",
            raw_steps=[
                {
                    "step_id": "ADIM-001",
                    "title": "Hedef fonksiyon oluştur",
                    "goal": "target.py içinde run() True dönsün",
                    "dependencies": [],
                    "tags": ["test", "core"],
                    "focus_files": ["target.py"],
                    "forbidden_paths": ["kurallar/"],
                    "acceptance_criteria": ["run() == True"],
                    "test_commands": [],
                    "requires_human_auth": "yok",
                },
                {
                    "step_id": "ADIM-002",
                    "title": "Bağımlı doğrulama ve tüketici adımı",
                    "goal": "target.py fonksiyonunun başarıyla tüketilmesi",
                    "dependencies": ["ADIM-001"],
                    "tags": ["test", "integration"],
                    "focus_files": ["consumer.py"],
                    "forbidden_paths": ["kurallar/"],
                    "acceptance_criteria": ["consumer.py passes"],
                    "test_commands": [],
                    "requires_human_auth": "yok",
                },
            ],
        )

        # 1. Execute ADIM-001 (triggers attempt 1 REWORK -> attempt 2 PASS)
        print("\n[*] ADIM-001 yürütülüyor (Tur 1 hatalı kod -> REWORK -> Tur 2 düzeltme -> PASS)...")
        res_step1 = loop.execute_single_step()

        # Assertions for Step 1
        print_assertion(
            "ADIM-001 döngü sonucu",
            expected="PASS",
            actual=res_step1,
            success=(res_step1 == "PASS"),
        )
        assert res_step1 == "PASS", f"ADIM-001 PASS almalıydı, alınan: {res_step1}"

        print_assertion(
            "Deneme geçmişi ve tur sayısı",
            expected="[1, 2]",
            actual=str(attempts_seen),
            success=(attempts_seen == [1, 2]),
            extra="Tur 1 REWORK aldı, Tur 2 düzeltildi (deneme bütçesi aşılmadı)",
        )
        assert attempts_seen == [1, 2], f"Beklenen denemeler [1, 2], gerçekleşen: {attempts_seen}"

        print_assertion(
            "Denetçi Tur 1 kararı",
            expected="REWORK (target.py içinde return True bekleniyordu)",
            actual=f"{reviewer_trace[0]['verdict']} ({reviewer_trace[0]['issues']})",
            success=(reviewer_trace[0]["verdict"] == "REWORK"),
        )
        assert reviewer_trace[0]["verdict"] == "REWORK"

        print_assertion(
            "Denetçi Tur 2 kararı",
            expected="PASS (issues: [])",
            actual=f"{reviewer_trace[1]['verdict']} ({reviewer_trace[1]['issues']})",
            success=(reviewer_trace[1]["verdict"] == "PASS"),
        )
        assert reviewer_trace[1]["verdict"] == "PASS"

        step1_status = loop.state["steps"][0]["status"]
        print_assertion(
            "ADIM-001 state.json durumu",
            expected="PASS",
            actual=step1_status,
            success=(step1_status == "PASS"),
        )
        assert step1_status == "PASS"

        # Check commit produced for ADIM-001
        step1_commit = loop.state["steps"][0].get("result_commit", "")
        print_assertion(
            "ADIM-001 sonuç commit'i oluşturuldu mu?",
            expected="Geçerli SHA (boş değil)",
            actual=step1_commit[:8] if step1_commit else "YOK",
            success=bool(step1_commit),
        )
        assert step1_commit, "ADIM-001 için gerçek commit oluşturulmalıydı!"

        # Verify non-empty commit content
        rc_diff, diff_files, _, _ = run_process_with_timeout(
            [git_bin, "diff-tree", "--no-commit-id", "--name-only", "-r", step1_commit],
            cwd=tmp_path,
            timeout_seconds=10,
        )
        has_target = "target.py" in diff_files
        print_assertion(
            "ADIM-001 commit içeriği kontrolü (Boş commit yasağı)",
            expected="target.py dosyasını içermeli",
            actual=diff_files.strip(),
            success=has_target,
        )
        assert has_target, f"Commit {step1_commit} içinde target.py bulunamadı!"

        # 2. Verify automatic transition to dependent step ADIM-002
        print("\n[*] Bağımlı adım (ADIM-002) geçiş kontrolü...")
        next_step = loop._find_next_pending_step()
        assert next_step is not None, "ADIM-001 tamamlandıktan sonra ADIM-002 hazır olmalı!"
        print_assertion(
            "Sıradaki yürütülebilir adım",
            expected="ADIM-002",
            actual=next_step["step_id"],
            success=(next_step["step_id"] == "ADIM-002"),
            extra="ADIM-001 PASS olduğu için ADIM-002 bağımlılığı otomatik çözüldü",
        )
        assert next_step["step_id"] == "ADIM-002"

        # 3. Execute ADIM-002 to verify end-to-end completion
        res_step2 = loop.execute_single_step()
        print_assertion(
            "ADIM-002 döngü sonucu",
            expected="PASS",
            actual=res_step2,
            success=(res_step2 == "PASS"),
        )
        assert res_step2 == "PASS"

        loop_status = loop.state.get("loop_status")
        print_assertion(
            "Tüm adımlar sonrası loop_status",
            expected="COMPLETED",
            actual=loop_status,
            success=(loop_status == "COMPLETED"),
        )
        assert loop_status == "COMPLETED"

        # Final git history in temp workspace
        final_info = get_git_info(tmp_path, git_bin)
        expected_commits = init_info["commit_count"] + 2  # init + step1 + step2
        commits_match = (final_info["commit_count"] == expected_commits)
        print_assertion(
            "Geçici repo toplam commit sayısı",
            expected=f"{expected_commits} (init + 2 adım commit)",
            actual=str(final_info["commit_count"]),
            success=commits_match,
        )
        assert commits_match, f"Beklenen {expected_commits} commit, bulunan: {final_info['commit_count']}"

        # Structured Telemetry Output for Scenario A
        telemetry_a = {
            "scenario": "SENARYO_A_REWORK_AUTO_RECOVERY",
            "verdict": "PASS",
            "isolation": {
                "temp_workspace": str(tmp_path),
                "is_isolated_from_host": is_isolated,
            },
            "step_progression": [
                {
                    "step_id": "ADIM-001",
                    "round_1": {
                        "attempt": 1,
                        "writer_summary": writer_trace[0]["summary"],
                        "reviewer_verdict": reviewer_trace[0]["verdict"],
                        "issues": reviewer_trace[0]["issues"],
                    },
                    "round_2": {
                        "attempt": 2,
                        "writer_summary": writer_trace[1]["summary"],
                        "reviewer_verdict": reviewer_trace[1]["verdict"],
                        "issues": reviewer_trace[1]["issues"],
                    },
                    "result_commit": step1_commit,
                    "diff_files": diff_files.strip().splitlines(),
                    "final_status": step1_status,
                },
                {
                    "step_id": "ADIM-002",
                    "dependencies": ["ADIM-001"],
                    "unlocked_automatically": True,
                    "attempt": 1,
                    "reviewer_verdict": reviewer_trace[2]["verdict"],
                    "final_status": loop.state["steps"][1]["status"],
                },
            ],
            "total_attempts_seen": attempts_seen,
            "final_loop_status": loop_status,
            "git_commit_count": final_info["commit_count"],
        }
        print_structured_telemetry("Senaryo A Detaylı Durum ve Geçiş Kanıtı", telemetry_a)

        print("  🎉 Senaryo A BAŞARIYLA TAMAMLANDI (REWORK -> Düzeltme -> Bağımlı Adım Geçişi -> Nihai Tamamlanma).")
        return True


def run_hold_test(host_workspace: Path, git_bin: str) -> bool:
    print("\n" + "=" * 80)
    print("▶️  SENARYO B (TERMİNAL HOLD VE BAĞIMLI ADIM BLOKAJI TESTİ)")
    print("=" * 80)

    with tempfile.TemporaryDirectory(prefix="autodev_test_hold_") as tmp_dir:
        tmp_path = Path(tmp_dir).resolve()
        print(f"[*] Geçici izole test alanı oluşturuldu: {tmp_path}")

        # Isolation check
        is_isolated = tmp_path != host_workspace and str(host_workspace) not in str(tmp_path)
        print_assertion(
            "Geçici alan izolasyonu",
            expected="Host çalışma ağacı dışında bağımsız geçici dizin",
            actual=str(tmp_path),
            success=is_isolated,
        )
        assert is_isolated, "Geçici alan host çalışma ağacından izole olmalı!"

        init_temp_git_workspace(tmp_path)
        init_info = get_git_info(tmp_path, git_bin)
        print(f"[*] Başlangıç commit'i: {init_info['head'][:8]} (Toplam commit: {init_info['commit_count']})")

        HOLD_REASON = "Kritik dış API sırrı eksik: Güvenli terminal HOLD talep edildi."
        step2_invocation_count = 0

        def mock_writer(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
            nonlocal step2_invocation_count
            if step_id == "ADIM-001":
                return RunnerResponse(
                    outcome="HOLD",
                    provider="AGY",
                    account_id="Hesap-1",
                    summary="Kritik dış API sırrı eksik.",
                    request_hold=True,
                    hold_reason=HOLD_REASON,
                )
            elif step_id == "ADIM-002":
                step2_invocation_count += 1
                # This should NEVER be called!
                (tmp_path / "blocked.txt").write_text("BU DOSYA ASLA YAZILMAMALIDIR\n", encoding="utf-8")
                return RunnerResponse(outcome="OK", provider="AGY", summary="Hatalı çalıştırma!")
            return RunnerResponse(outcome="HOLD", provider="AGY", summary="Bilinmeyen adım")

        loop = AutoDevLoop(root_dir=tmp_path)
        loop.runners = AutoDevRunners(
            loop.config,
            loop.workspace_path,
            mock_writer=mock_writer,
        )

        loop.initialize_roadmap_memory(
            project_name="FaultResilienceHoldTest",
            roadmap_goal="HOLD Resilience Test",
            raw_steps=[
                {
                    "step_id": "ADIM-001",
                    "title": "HOLD tetikleyen adım",
                    "goal": "Sır eksikliğinde güvenli terminal HOLD tetikleme",
                    "dependencies": [],
                    "tags": ["test", "hold"],
                    "focus_files": ["hold.txt"],
                    "forbidden_paths": ["kurallar/"],
                    "acceptance_criteria": ["HOLD durumuna geçmeli"],
                    "test_commands": [],
                    "requires_human_auth": "yok",
                },
                {
                    "step_id": "ADIM-002",
                    "title": "Asla başlamaması gereken bağımlı adım",
                    "goal": "ADIM-001 HOLD olduğunda bu adım bloke kalmalı",
                    "dependencies": ["ADIM-001"],
                    "tags": ["test", "blocked"],
                    "focus_files": ["blocked.txt"],
                    "forbidden_paths": ["kurallar/"],
                    "acceptance_criteria": ["Asla çalışmamalı"],
                    "test_commands": [],
                    "requires_human_auth": "yok",
                },
            ],
        )

        # 1. Execute ADIM-001 (should enter terminal HOLD)
        print("\n[*] ADIM-001 yürütülüyor (Terminal HOLD tetiklenecek)...")
        res_step1 = loop.execute_single_step()

        print_assertion(
            "ADIM-001 yürütme dönüş değeri",
            expected="HOLD",
            actual=res_step1,
            success=(res_step1 == "HOLD"),
        )
        assert res_step1 == "HOLD", f"Beklenen HOLD, alınan: {res_step1}"

        print_assertion(
            "Genel loop_status",
            expected="HOLD",
            actual=loop.state.get("loop_status"),
            success=(loop.state.get("loop_status") == "HOLD"),
        )
        assert loop.state.get("loop_status") == "HOLD"

        print_assertion(
            "Checkpoint ve state içindeki HOLD nedeni",
            expected=HOLD_REASON,
            actual=loop.state.get("hold_reason"),
            success=(loop.state.get("hold_reason") == HOLD_REASON),
            extra="HOLD nedeni checkpoint'te korunuyor",
        )
        assert loop.state.get("hold_reason") == HOLD_REASON

        step1_status = loop.state["steps"][0]["status"]
        print_assertion(
            "ADIM-001 adım durumu",
            expected="HOLD",
            actual=step1_status,
            success=(step1_status == "HOLD"),
        )
        assert step1_status == "HOLD"

        # 2. Verify dependent step ADIM-002 is strictly blocked
        print("\n[*] Bağımlı adım (ADIM-002) blokaj kontrolü...")
        step2_status = loop.state["steps"][1]["status"]
        print_assertion(
            "ADIM-002 adım durumu",
            expected="PENDING",
            actual=step2_status,
            success=(step2_status == "PENDING"),
            extra="Bağımlı adım hiç başlatılmadı, PENDING kaldı",
        )
        assert step2_status == "PENDING"

        print_assertion(
            "Bağımlı adım çağrılma sayısı",
            expected=0,
            actual=step2_invocation_count,
            success=(step2_invocation_count == 0),
            extra="ADIM-002 mock_writer fonksiyonu hiç tetiklenmedi",
        )
        assert step2_invocation_count == 0

        blocked_file_exists = (tmp_path / "blocked.txt").exists()
        print_assertion(
            "Bağımlı adım yan etki kontrolü (Dosya varlığı)",
            expected="False (blocked.txt oluşturulmamalı)",
            actual=str(blocked_file_exists),
            success=(not blocked_file_exists),
        )
        assert not blocked_file_exists, "ADIM-002 bloke olmalıydı ancak blocked.txt oluşturulmuş!"

        next_step = loop._find_next_pending_step()
        print_assertion(
            "Scheduler sıradaki adım seçimi",
            expected="None (tüm bekleyen adımlar bloke)",
            actual=str(next_step),
            success=(next_step is None),
            extra="Bağımlılığı karşılanmamış adım scheduler tarafından aday seçilemez",
        )
        assert next_step is None

        # 3. Test re-entry guard: calling execute_single_step() again when loop is HOLD
        print("\n[*] Scheduler yeniden giriş (re-entry) koruma kontrolü...")
        res_reentry = loop.execute_single_step()
        print_assertion(
            "HOLD durumunda tekrar execute_single_step() çağrısı",
            expected="HOLD",
            actual=res_reentry,
            success=(res_reentry == "HOLD"),
            extra="Scheduler HOLD durumundayken bağımlı adımı çalıştırmaz, HOLD döner",
        )
        assert res_reentry == "HOLD"

        # Re-entry HOLD reason preservation checks (in-memory state and on-disk checkpoint)
        state_hold_reason_after = loop.state.get("hold_reason")
        reentry_state_matches = (state_hold_reason_after == HOLD_REASON)
        print_assertion(
            "Yeniden giriş sonrası in-memory state HOLD nedeni değişmezliği",
            expected=HOLD_REASON,
            actual=state_hold_reason_after,
            success=reentry_state_matches,
            extra="Scheduler terminal HOLD nedenini yeniden girişte ezmemeli (ilk terminal neden korunmalı)",
        )
        assert reentry_state_matches, (
            f"Yeniden giriş sonrası in-memory hold_reason bozuldu! "
            f"Beklenen: '{HOLD_REASON}', Mevcut: '{state_hold_reason_after}'"
        )

        checkpoint_path = tmp_path / "state.json"
        assert checkpoint_path.is_file(), "state.json kalıcı checkpoint dosyası bulunamadı!"
        checkpoint_data = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        checkpoint_hold_reason = checkpoint_data.get("hold_reason")
        reentry_checkpoint_matches = (checkpoint_hold_reason == HOLD_REASON)
        print_assertion(
            "Yeniden giriş sonrası kalıcı checkpoint (state.json) HOLD nedeni değişmezliği",
            expected=HOLD_REASON,
            actual=checkpoint_hold_reason,
            success=reentry_checkpoint_matches,
            extra="Kalıcı checkpoint dosyasında terminal HOLD nedeni aynen korundu",
        )
        assert reentry_checkpoint_matches, (
            f"Yeniden giriş sonrası kalıcı checkpoint (state.json) hold_reason bozuldu! "
            f"Beklenen: '{HOLD_REASON}', Mevcut: '{checkpoint_hold_reason}'"
        )

        # 4. Verify no empty commits were generated
        print("\n[*] Git commit koruma kontrolü (Boş commit yasağı)...")
        final_info = get_git_info(tmp_path, git_bin)
        commits_unchanged = (final_info["commit_count"] == init_info["commit_count"])
        print_assertion(
            "HOLD durumunda commit sayısı değişmemeli",
            expected=f"{init_info['commit_count']} (yalnızca init commit)",
            actual=str(final_info["commit_count"]),
            success=commits_unchanged,
            extra="HOLD sırasında boş commit oluşturulmadı, HEAD korundu",
        )
        assert commits_unchanged, "HOLD durumunda fazladan commit oluşturulmamalıydı!"

        heads_match = (final_info["head"] == init_info["head"])
        print_assertion(
            "HEAD SHA değişmemeli",
            expected=init_info["head"][:8],
            actual=final_info["head"][:8],
            success=heads_match,
        )
        assert heads_match, "HOLD durumunda HEAD SHA değişmemeliydi!"

        # 5. Verify recovery markdown/state persistence
        index_text = (tmp_path / "hafiza" / "INDEX.md").read_text(encoding="utf-8")
        has_hold_in_index = "HOLD" in index_text
        print_assertion(
            "INDEX.md içinde HOLD durumu yansıtıldı mı?",
            expected="True",
            actual=str(has_hold_in_index),
            success=has_hold_in_index,
        )
        assert has_hold_in_index

        # Structured Telemetry Output for Scenario B
        telemetry_b = {
            "scenario": "SENARYO_B_TERMINAL_HOLD_AND_BLOCKING",
            "verdict": "PASS",
            "isolation": {
                "temp_workspace": str(tmp_path),
                "is_isolated_from_host": is_isolated,
            },
            "trigger_step": {
                "step_id": "ADIM-001",
                "attempt": 1,
                "writer_outcome": "HOLD",
                "request_hold": True,
                "hold_reason": HOLD_REASON,
                "final_status": step1_status,
            },
            "blocked_step": {
                "step_id": "ADIM-002",
                "dependency": "ADIM-001",
                "final_status": step2_status,
                "invocations": step2_invocation_count,
                "side_effect_files_created": blocked_file_exists,
            },
            "scheduler_guards": {
                "loop_status": loop.state.get("loop_status"),
                "hold_reason_in_state": loop.state.get("hold_reason"),
                "hold_reason_in_checkpoint": checkpoint_hold_reason,
                "hold_reason_preserved_after_reentry": (
                    reentry_state_matches and reentry_checkpoint_matches
                ),
                "next_pending_step": next_step,
                "reentry_result": res_reentry,
                "initial_commits": init_info["commit_count"],
                "final_commits": final_info["commit_count"],
                "empty_commits_created": 0,
                "head_sha_unchanged": heads_match,
                "index_markdown_updated": has_hold_in_index,
            },
        }
        print_structured_telemetry("Senaryo B Detaylı Durum ve Blokaj Kanıtı", telemetry_b)

        print("  🎉 Senaryo B BAŞARIYLA TAMAMLANDI (Terminal HOLD -> Bağımlı Adım Blokajı -> 0 Yan Etki -> 0 Boş Commit).")
        return True


def run_host_isolation_check(host_workspace: Path, git_bin: str, baseline_info: dict[str, Any]) -> bool:
    print("\n" + "=" * 80)
    print("🛡️  GERÇEK LARİ ÇALIŞMA AĞACI İZOLASYON VE GİT YAN ETKİ KONTROLÜ")
    print("=" * 80)

    post_info = get_git_info(host_workspace, git_bin)

    # 1. Check HEAD SHA unchanged
    head_unchanged = (post_info["head"] == baseline_info["head"])
    print_assertion(
        "Host HEAD commit değişmezliği",
        expected=baseline_info["head"],
        actual=post_info["head"],
        success=head_unchanged,
        extra="Test çalışması host Git geçmişine yeni/boş commit eklemedi",
    )
    assert head_unchanged, f"Host HEAD değişti! Önceki: {baseline_info['head']}, Şimdiki: {post_info['head']}"

    # 2. Check Commit count unchanged
    cnt_unchanged = (post_info["commit_count"] == baseline_info["commit_count"])
    print_assertion(
        "Host toplam commit sayısı",
        expected=baseline_info["commit_count"],
        actual=post_info["commit_count"],
        success=cnt_unchanged,
    )
    assert cnt_unchanged, "Host commit sayısı değişti!"

    # 3. Check Git Status: no new files leaked
    # Filter out test script itself if it is located in host workspace
    pre_lines = set(baseline_info["status"].splitlines()) if baseline_info["status"] else set()
    post_lines = set(post_info["status"].splitlines()) if post_info["status"] else set()

    # Identify any newly introduced dirty paths
    new_dirty_lines = [l for l in post_lines if l not in pre_lines and "tests/run_fault_resilience_test.py" not in l]
    no_leakage = (len(new_dirty_lines) == 0)
    print_assertion(
        "Host çalışma ağacı kirlenme kontrolü (Dosya sızıntısı yasağı)",
        expected="Sıfır yeni kirli/değişik dosya (no leakage)",
        actual=f"{len(new_dirty_lines)} yeni dosya: {new_dirty_lines}" if new_dirty_lines else "Temiz",
        success=no_leakage,
        extra="Senaryo A ve B'deki dosyalar (target.py, consumer.py, blocked.txt vb.) host çalışma ağacına sızmadı",
    )
    assert no_leakage, f"Host çalışma ağacına dosya sızdı: {new_dirty_lines}"

    # Structured Telemetry Output for Host Isolation Check
    telemetry_iso = {
        "check": "HOST_WORKSPACE_ISOLATION_AND_GIT_GUARD",
        "verdict": "PASS",
        "host_workspace_path": str(host_workspace),
        "pre_test_baseline": {
            "head_sha": baseline_info["head"],
            "commit_count": baseline_info["commit_count"],
            "status": baseline_info["status"] or "(clean)",
        },
        "post_test_state": {
            "head_sha": post_info["head"],
            "commit_count": post_info["commit_count"],
            "status": post_info["status"] or "(clean)",
        },
        "deltas": {
            "head_sha_delta": 0 if head_unchanged else "MISMATCH",
            "commit_count_delta": post_info["commit_count"] - baseline_info["commit_count"],
            "new_dirty_files_leaked": new_dirty_lines,
            "zero_empty_commits": True,
            "zero_file_pollution": no_leakage,
        },
    }
    print_structured_telemetry("Host Çalışma Ağacı İzolasyon ve Git Yan Etki Kanıtı", telemetry_iso)

    print("  🎉 Host çalışma ağacı izolasyon doğrulaması EKSİKSİZ GEÇTİ.")
    return True


def main() -> int:
    print("=" * 80)
    print("🧪 ADIM-004: AUTODEV SCHEDULER FAULT RESILIENCE TEST")
    print("   (Senaryo A: REWORK Düzelme | Senaryo B: Terminal HOLD | İzolasyon Denetimi)")
    print("=" * 80)

    git_bin = find_git_binary()
    host_workspace = Path(os.environ.get("AUTODEV_HOST_WORKSPACE", "C:/Projects/Randapp-LARI-PILOT2")).resolve()
    if not host_workspace.exists():
        host_workspace = Path(os.getcwd()).resolve()

    print(f"[*] Git ikilisi : {git_bin}")
    print(f"[*] Host dizini : {host_workspace}")

    baseline_info = get_git_info(host_workspace, git_bin)
    print(f"[*] Host HEAD   : {baseline_info['head']}")
    print(f"[*] Host Commits: {baseline_info['commit_count']}")
    print(f"[*] Host Status : {baseline_info['status'] or '(Temiz)'}")

    try:
        ok_a = run_rework_test(host_workspace, git_bin)
        ok_b = run_hold_test(host_workspace, git_bin)
        ok_iso = run_host_isolation_check(host_workspace, git_bin, baseline_info)

        if ok_a and ok_b and ok_iso:
            print("\n" + "=" * 80)
            print("🎉 TÜM FAULT RESILIENCE SENARYOLARI (REWORK + HOLD + İZOLASYON) BAŞARIYLA GEÇTİ!")
            print("=" * 80)
            return 0
        return 1
    except Exception as e:
        print(f"\n❌ TEST BAŞARISIZ OLDU: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
