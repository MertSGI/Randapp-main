"""Automated Restart Recovery & Quota Interruption Verification for ADIM-005.

Tests two controlled fault-tolerance and resilience scenarios on an isolated temporary workspace:
1. Scenario 1 — Restart Recovery & Checkpoint Resumption (2 Separate Subprocess Phases):
   - Phase 1 Subprocess:
     * Executes Step 1 to completion in an isolated OS process.
     * Records state.json checkpoint and Git commit on disk.
     * Gracefully terminates (Process 1 completely exits, releasing OS resources and locks).
   - Phase 2 Subprocess:
     * Starts a brand-new independent Python process with completely clean memory (different PID).
     * Loads roadmap and status EXCLUSIVELY from on-disk state.json checkpoint (does not re-init).
     * Triggers reconcile_on_startup() verifying parent commit and DAG integrity.
     * Verifies Step 1 is NOT re-executed (DAG progress strictly preserved, 0 duplicates).
     * Automatically picks up dependent Step 2 and completes with PASS and a real Git commit.
     * Proves crash recovery, reboot resilience, and DAG continuity across process boundaries.
2. Scenario 2 — Quota Interruption & Zero-Paid-Fallback Enforcement:
   - Asserts existence of attempt and budget fields in state (memory, disk, and step level).
   - Takes authoritative pre-execution snapshot BEFORE any quota execution call (res_wait1).
   - Simulates RESOURCE_UNAVAILABLE / 429 quota exhaustion across all AGY runner accounts.
   - First execution under quota: scheduler enters WAIT state; strictly verifies post-WAIT-1 counters 1:1 match initial snapshot.
   - Second execution tick under quota: strictly verifies post-WAIT-2 counters 1:1 match initial snapshot (0 budget consumed).
   - Verifies mock writer is NOT called during quota wait (call_count == 0).
   - Verifies zero paid fallback is activated (Codex is never used as fallback writer).
   - Simulates quota reset / cooldown expiration.
   - Re-executes step; verifies seamless recovery and transition to PASS with a real Git commit.
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
import time
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


def _append_trace(trace_file: Path, entry: dict[str, Any]) -> None:
    """Safely append an execution trace entry to the shared JSON trace file."""
    for _ in range(50):
        try:
            if trace_file.is_file():
                raw = trace_file.read_text(encoding="utf-8")
                data = json.loads(raw) if raw.strip() else []
            else:
                data = []
            data.append(entry)
            trace_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            return
        except Exception:
            time.sleep(0.05)


def worker_phase_1(workspace_dir: Path, trace_file: Path) -> int:
    """Subprocess Worker for Scenario 1 / Phase 1: Initialize roadmap and execute Step 1."""
    pid = os.getpid()
    print(f"[*] [Subprocess Phase 1 | PID {pid}] Başlatıldı: {workspace_dir}")

    loop1 = AutoDevLoop(root_dir=workspace_dir)

    def mock_writer_p1(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
        target_file = workspace_dir / f"{step_id}.txt"
        target_file.write_text(f"content of {step_id}\n", encoding="utf-8")
        entry = {
            "phase": 1,
            "pid": pid,
            "action": "WRITER",
            "step_id": step_id,
            "attempt": attempt,
            "summary": f"{step_id} phase 1 writer tarafından üretildi.",
        }
        _append_trace(trace_file, entry)
        return RunnerResponse(
            outcome="OK",
            provider="AGY",
            account_id="Hesap-1",
            summary=entry["summary"],
        )

    def mock_reviewer_p1(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
        entry = {
            "phase": 1,
            "pid": pid,
            "action": "REVIEWER",
            "step_id": step_id,
            "attempt": attempt,
            "verdict": "PASS",
        }
        _append_trace(trace_file, entry)
        return RunnerResponse(
            outcome="OK",
            provider="CODEX",
            account_id="Codex-ReadOnly",
            summary=f"{step_id} phase 1 bağımsız denetimden geçti.",
            payload={
                "verdict": "PASS",
                "issues": [],
                "decisions_taken": [f"{step_id} için doğrulama ve checkpoint onaylandı."],
            },
        )

    loop1.runners = AutoDevRunners(
        loop1.config,
        loop1.workspace_path,
        mock_writer=mock_writer_p1,
        mock_reviewer=mock_reviewer_p1,
    )

    loop1.initialize_roadmap_memory(
        project_name="RestartRecoveryTest",
        roadmap_goal="DAG Recovery & Resumption Test",
        raw_steps=[
            {
                "step_id": "ADIM-001",
                "title": "İlk Adım (Önkoşul)",
                "goal": "ADIM-001.txt dosyasının üretilmesi",
                "dependencies": [],
                "tags": ["recovery", "test"],
                "focus_files": ["ADIM-001.txt"],
                "forbidden_paths": ["kurallar/"],
                "acceptance_criteria": ["ADIM-001.txt mevcut olmalı"],
                "test_commands": [],
                "requires_human_auth": "yok",
            },
            {
                "step_id": "ADIM-002",
                "title": "İkinci Adım (Bağımlı)",
                "goal": "ADIM-002.txt dosyasının üretilmesi",
                "dependencies": ["ADIM-001"],
                "tags": ["recovery", "test"],
                "focus_files": ["ADIM-002.txt"],
                "forbidden_paths": ["kurallar/"],
                "acceptance_criteria": ["ADIM-002.txt mevcut olmalı"],
                "test_commands": [],
                "requires_human_auth": "yok",
            },
        ],
    )

    res = loop1.execute_single_step()
    if res != "PASS":
        print(f"❌ [Phase 1 Error] execute_single_step() {res} döndürdü, beklenen PASS", file=sys.stderr)
        return 1

    commit1 = loop1.state["steps"][0].get("result_commit", "")
    if not commit1:
        print(f"❌ [Phase 1 Error] ADIM-001 commit SHA boş!", file=sys.stderr)
        return 1

    _append_trace(trace_file, {
        "phase": 1,
        "pid": pid,
        "action": "PHASE_COMPLETE",
        "step_id": "ADIM-001",
        "status": "PASS",
        "commit": commit1,
    })
    print(f"[*] [Subprocess Phase 1 | PID {pid}] Tamamlandı: ADIM-001 PASS ({commit1[:8]})")
    return 0


def worker_phase_2(workspace_dir: Path, trace_file: Path) -> int:
    """Subprocess Worker for Scenario 1 / Phase 2: Resume from disk checkpoint, skip Step 1, run Step 2."""
    pid = os.getpid()
    print(f"[*] [Subprocess Phase 2 | PID {pid}] Başlatıldı: {workspace_dir}")

    checkpoint_file = workspace_dir / "state.json"
    if not checkpoint_file.is_file():
        print(f"❌ [Phase 2 Error] state.json checkpoint dosyası diskte bulunamadı!", file=sys.stderr)
        return 1

    # In Phase 2: Start brand-new AutoDevLoop reading EXCLUSIVELY from disk checkpoint.
    # We DO NOT call initialize_roadmap_memory; in-memory state is empty.
    loop2 = AutoDevLoop(root_dir=workspace_dir)

    def mock_writer_p2(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
        if step_id == "ADIM-001":
            err_msg = "KRİTİK HATA: ADIM-001 restart sonrasında ASLA tekrar yürütülmemelidir!"
            print(f"❌ [Phase 2 Error] {err_msg}", file=sys.stderr)
            raise RuntimeError(err_msg)
        target_file = workspace_dir / f"{step_id}.txt"
        target_file.write_text(f"content of {step_id}\n", encoding="utf-8")
        entry = {
            "phase": 2,
            "pid": pid,
            "action": "WRITER",
            "step_id": step_id,
            "attempt": attempt,
            "summary": f"{step_id} phase 2 writer tarafından üretildi.",
        }
        _append_trace(trace_file, entry)
        return RunnerResponse(
            outcome="OK",
            provider="AGY",
            account_id="Hesap-2",
            summary=entry["summary"],
        )

    def mock_reviewer_p2(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
        entry = {
            "phase": 2,
            "pid": pid,
            "action": "REVIEWER",
            "step_id": step_id,
            "attempt": attempt,
            "verdict": "PASS",
        }
        _append_trace(trace_file, entry)
        return RunnerResponse(
            outcome="OK",
            provider="CODEX",
            account_id="Codex-ReadOnly",
            summary=f"{step_id} phase 2 bağımsız denetimden geçti.",
            payload={
                "verdict": "PASS",
                "issues": [],
                "decisions_taken": [f"{step_id} için phase 2 doğrulaması onaylandı."],
            },
        )

    loop2.runners = AutoDevRunners(
        loop2.config,
        loop2.workspace_path,
        mock_writer=mock_writer_p2,
        mock_reviewer=mock_reviewer_p2,
    )

    # 1. Startup reconciliation strictly from disk checkpoint
    reconcile_res = loop2.reconcile_on_startup()
    if reconcile_res != "OK":
        print(f"❌ [Phase 2 Error] reconcile_on_startup() {reconcile_res} döndürdü", file=sys.stderr)
        return 1

    # 2. Verify Step 1 remains PASS from disk checkpoint
    if loop2.state["steps"][0]["status"] != "PASS":
        print(f"❌ [Phase 2 Error] Step 1 status PASS değil: {loop2.state['steps'][0]['status']}", file=sys.stderr)
        return 1

    # 3. Next pending step MUST be ADIM-002 (ADIM-001 must be skipped!)
    next_step = loop2._find_next_pending_step()
    if not next_step or next_step["step_id"] != "ADIM-002":
        print(f"❌ [Phase 2 Error] Sıradaki adım ADIM-002 olmalıydı: {next_step}", file=sys.stderr)
        return 1

    # 4. Execute Step 2
    res2 = loop2.execute_single_step()
    if res2 != "PASS":
        print(f"❌ [Phase 2 Error] execute_single_step() {res2} döndürdü, beklenen PASS", file=sys.stderr)
        return 1

    commit2 = loop2.state["steps"][1].get("result_commit", "")
    if not commit2:
        print(f"❌ [Phase 2 Error] ADIM-002 commit SHA boş!", file=sys.stderr)
        return 1

    _append_trace(trace_file, {
        "phase": 2,
        "pid": pid,
        "action": "PHASE_COMPLETE",
        "step_id": "ADIM-002",
        "status": "PASS",
        "commit": commit2,
    })
    print(f"[*] [Subprocess Phase 2 | PID {pid}] Tamamlandı: ADIM-002 PASS ({commit2[:8]})")
    return 0


def run_restart_recovery_test(host_workspace: Path, git_bin: str) -> bool:
    print("\n" + "=" * 80)
    print("▶️  SENARYO 1: RESTART RECOVERY & CHECKPOINT RESUMPTION TESTİ (2 AYRI SUBPROCESS FAZI)")
    print("=" * 80)

    with tempfile.TemporaryDirectory(prefix="autodev_test_recovery_") as tmp_dir:
        base_tmp = Path(tmp_dir).resolve()
        repo_path = base_tmp / "repo"
        repo_path.mkdir(parents=True, exist_ok=True)
        print(f"[*] Geçici izole test alanı oluşturuldu: {repo_path}")

        # 1. Isolation check
        is_isolated = repo_path != host_workspace and str(host_workspace) not in str(repo_path)
        print_assertion(
            "Geçici alan izolasyonu",
            expected="Host çalışma ağacı dışında bağımsız geçici dizin",
            actual=str(repo_path),
            success=is_isolated,
        )
        assert is_isolated, "Geçici alan host çalışma ağacından izole olmalı!"

        init_temp_git_workspace(repo_path)
        init_info = get_git_info(repo_path, git_bin)
        print(f"[*] Başlangıç commit'i: {init_info['head'][:8]} (Toplam commit: {init_info['commit_count']})")

        # trace_file is kept outside the git repo to prevent worktree pollution (no untracked files)
        trace_file = base_tmp / "execution_trace.json"
        trace_file.write_text("[]", encoding="utf-8")

        # 2. SUBPROCESS FAZ 1: İlk çalışma süreci başlatılıyor
        print("\n[*] [Subprocess Faz 1] İlk Python süreci başlatılıyor (ADIM-001 yürütmesi)...")
        script_path = Path(__file__).resolve()
        cmd_p1 = [
            sys.executable,
            str(script_path),
            "--worker-phase-1",
            str(repo_path),
            str(trace_file),
        ]
        rc1, out1, err1, timed_out1 = run_process_with_timeout(cmd_p1, cwd=repo_path, timeout_seconds=60)
        print(out1.strip())
        if err1.strip():
            print(f"[STDERR Faz 1]: {err1.strip()}", file=sys.stderr)
        assert not timed_out1, "Subprocess Faz 1 zaman aşımına uğradı!"
        assert rc1 == 0, f"Subprocess Faz 1 hata ile çıktı: rc={rc1}"

        # Disk checkpoint inspection between processes (Graceful termination of Process 1)
        print("\n[*] [Graceful Shutdown Doğrulaması] İlk süreç tamamen sonlandı (PID kapandı).")
        checkpoint_path = repo_path / "state.json"
        assert checkpoint_path.is_file(), "state.json kalıcı checkpoint dosyası diskte bulunmalı!"
        checkpoint_data = json.loads(checkpoint_path.read_text(encoding="utf-8"))

        step1_checkpoint_status = checkpoint_data["steps"][0]["status"]
        print_assertion(
            "Kalıcı state.json disk checkpoint'inde ADIM-001 durumu",
            expected="PASS",
            actual=step1_checkpoint_status,
            success=(step1_checkpoint_status == "PASS"),
        )
        assert step1_checkpoint_status == "PASS"

        step1_checkpoint_commit = checkpoint_data["steps"][0].get("result_commit", "")
        print_assertion(
            "Disk checkpoint'inde ADIM-001 commit SHA kaydı",
            expected="Geçerli commit SHA",
            actual=step1_checkpoint_commit[:8] if step1_checkpoint_commit else "YOK",
            success=bool(step1_checkpoint_commit),
        )
        assert step1_checkpoint_commit

        step2_pre_status = checkpoint_data["steps"][1]["status"]
        print_assertion(
            "Disk checkpoint'inde ADIM-002 başlangıç durumu",
            expected="PENDING",
            actual=step2_pre_status,
            success=(step2_pre_status == "PENDING"),
        )
        assert step2_pre_status == "PENDING"

        # 3. SUBPROCESS FAZ 2: İkinci, tamamen temiz bellekli bağımsız Python süreci başlatılıyor
        print("\n[*] [Subprocess Faz 2] İkinci Python süreci başlatılıyor (Yalnızca disk checkpoint'inden resumption)...")
        cmd_p2 = [
            sys.executable,
            str(script_path),
            "--worker-phase-2",
            str(repo_path),
            str(trace_file),
        ]
        rc2, out2, err2, timed_out2 = run_process_with_timeout(cmd_p2, cwd=repo_path, timeout_seconds=60)
        print(out2.strip())
        if err2.strip():
            print(f"[STDERR Faz 2]: {err2.strip()}", file=sys.stderr)
        assert not timed_out2, "Subprocess Faz 2 zaman aşımına uğradı!"
        assert rc2 == 0, f"Subprocess Faz 2 hata ile çıktı: rc={rc2}"

        # 4. Strict Dual-Process Trace Analysis
        trace_data = json.loads(trace_file.read_text(encoding="utf-8"))
        p1_records = [e for e in trace_data if e.get("phase") == 1]
        p2_records = [e for e in trace_data if e.get("phase") == 2]

        pid1 = p1_records[0]["pid"] if p1_records else -1
        pid2 = p2_records[0]["pid"] if p2_records else -1

        print_assertion(
            "Ayrı OS Süreç İzolasyonu (Farklı PID doğrulaması)",
            expected="PID_1 != PID_2",
            actual=f"PID_1={pid1}, PID_2={pid2}",
            success=(pid1 > 0 and pid2 > 0 and pid1 != pid2),
            extra="İki faz kesinlikle ayrı Python işletim sistemi süreçlerinde çalıştı; bellek sıfırlandı",
        )
        assert pid1 > 0 and pid2 > 0 and pid1 != pid2, f"PID'ler farklı olmalıydı: {pid1} vs {pid2}"

        writer_events = [e for e in trace_data if e.get("action") == "WRITER"]
        executed_steps = [e["step_id"] for e in writer_events]

        print_assertion(
            "Yürütülen adımlar sırası ve mükerrer çalıştırmama garantisi",
            expected="['ADIM-001', 'ADIM-002']",
            actual=str(executed_steps),
            success=(executed_steps == ["ADIM-001", "ADIM-002"]),
            extra="ADIM-001 restart sonrasında Faz 2'de ASLA tekrar yürütülmedi",
        )
        assert executed_steps == ["ADIM-001", "ADIM-002"], f"Mükerrer veya eksik adım yürütmesi: {executed_steps}"

        step1_run_count = executed_steps.count("ADIM-001")
        print_assertion(
            "ADIM-001 toplam yürütme sayısı",
            expected=1,
            actual=step1_run_count,
            success=(step1_run_count == 1),
        )
        assert step1_run_count == 1

        # Check PID distribution
        step1_pids = [e["pid"] for e in writer_events if e["step_id"] == "ADIM-001"]
        step2_pids = [e["pid"] for e in writer_events if e["step_id"] == "ADIM-002"]
        assert step1_pids == [pid1], f"ADIM-001 yalnız Faz 1 (PID {pid1}) tarafından yürütülmeliydi: {step1_pids}"
        assert step2_pids == [pid2], f"ADIM-002 yalnız Faz 2 (PID {pid2}) tarafından yürütülmeliydi: {step2_pids}"

        # 5. Check Final Disk Checkpoint & Commits
        final_checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        step2_final_status = final_checkpoint["steps"][1]["status"]
        step2_final_commit = final_checkpoint["steps"][1].get("result_commit", "")

        print_assertion(
            "Nihai state.json'da ADIM-002 durumu",
            expected="PASS",
            actual=step2_final_status,
            success=(step2_final_status == "PASS"),
        )
        assert step2_final_status == "PASS"

        print_assertion(
            "Nihai state.json'da ADIM-002 Git commit kaydı",
            expected="Geçerli commit SHA",
            actual=step2_final_commit[:8] if step2_final_commit else "YOK",
            success=bool(step2_final_commit),
        )
        assert step2_final_commit

        # Verify commit contents on disk
        rc_diff1, diff1_files, _, _ = run_process_with_timeout(
            [git_bin, "diff-tree", "--no-commit-id", "--name-only", "-r", step1_checkpoint_commit],
            cwd=repo_path,
            timeout_seconds=10,
        )
        rc_diff2, diff2_files, _, _ = run_process_with_timeout(
            [git_bin, "diff-tree", "--no-commit-id", "--name-only", "-r", step2_final_commit],
            cwd=repo_path,
            timeout_seconds=10,
        )
        has_file1 = "ADIM-001.txt" in diff1_files
        has_file2 = "ADIM-002.txt" in diff2_files
        assert has_file1, "Commit 1 içinde ADIM-001.txt bulunamadı!"
        assert has_file2, "Commit 2 içinde ADIM-002.txt bulunamadı!"

        # Verify Git DAG Parentage (ADIM-002's parent commit is ADIM-001)
        rc_parent, parent_sha, _, _ = run_process_with_timeout(
            [git_bin, "rev-parse", step2_final_commit + "^"],
            cwd=repo_path,
            timeout_seconds=10,
        )
        step2_parent_is_step1 = (rc_parent == 0 and parent_sha.strip() == step1_checkpoint_commit)
        print_assertion(
            "Git DAG devamlılığı: ADIM-002'nin parent commit'i ADIM-001 olmalı",
            expected=step1_checkpoint_commit[:8],
            actual=parent_sha.strip()[:8] if rc_parent == 0 else "HATA",
            success=step2_parent_is_step1,
        )
        assert step2_parent_is_step1, f"Git DAG sürekliliği bozuldu: parent={parent_sha.strip()}"

        # Structured Telemetry Output for Scenario 1
        telemetry_1 = {
            "scenario": "SENARYO_1_RESTART_RECOVERY_AND_RESUMPTION_SUBPROCESS",
            "verdict": "PASS",
            "isolation": {
                "temp_workspace": str(repo_path),
                "is_isolated_from_host": is_isolated,
            },
            "process_architecture": {
                "phase_1_subprocess_pid": pid1,
                "phase_2_subprocess_pid": pid2,
                "independent_processes_verified": True,
            },
            "phase_1_execution": {
                "executed_step": "ADIM-001",
                "status": step1_checkpoint_status,
                "commit": step1_checkpoint_commit,
                "checkpoint_written": True,
            },
            "phase_2_resumption_from_checkpoint": {
                "loaded_only_from_disk_checkpoint": True,
                "reconcile_result": "OK",
                "step_1_preserved_status": step1_checkpoint_status,
                "next_selected_step": "ADIM-002",
                "executed_step": "ADIM-002",
                "step_2_status": step2_final_status,
                "step_2_commit": step2_final_commit,
            },
            "invariants_verified": {
                "step_1_re_executed": False,
                "step_1_total_run_count": step1_run_count,
                "exact_execution_sequence": executed_steps,
                "step_1_pid": step1_pids[0],
                "step_2_pid": step2_pids[0],
                "dag_parent_commit_verified": step2_parent_is_step1,
                "dag_completed_cleanly": True,
            },
        }
        print_structured_telemetry("Senaryo 1 Restart Recovery & Resumption Kanıtı (Ayrı Subprocess)", telemetry_1)

        print("  🎉 Senaryo 1 BAŞARIYLA TAMAMLANDI (Ayrı Subprocess -> Checkpoint'ten Devam -> 0 Mükerrer -> Bağımlı Adım Kabulü).")
        return True


def run_quota_interruption_test(host_workspace: Path, git_bin: str) -> bool:
    print("\n" + "=" * 80)
    print("▶️  SENARYO 2: KOTA KESİNTİSİ & ÜCRETSİZ KALMA (ZERO-PAID-FALLBACK) TESTİ")
    print("=" * 80)

    with tempfile.TemporaryDirectory(prefix="autodev_test_quota_") as tmp_dir:
        tmp_path = Path(tmp_dir).resolve()
        print(f"[*] Geçici izole test alanı oluşturuldu: {tmp_path}")

        # 1. Isolation check
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

        writer_call_count = 0
        writer_invocations: list[dict[str, Any]] = []

        def mock_writer(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
            nonlocal writer_call_count
            writer_call_count += 1
            target_file = tmp_path / "quota_test.txt"
            target_file.write_text("quota test success\n", encoding="utf-8")
            entry = {
                "step_id": step_id,
                "attempt": attempt,
                "call_index": writer_call_count,
            }
            writer_invocations.append(entry)
            return RunnerResponse(
                outcome="OK",
                provider="AGY",
                account_id="Hesap-1",
                summary="Kota beklemesi sonrasında başarılı yazıldı.",
            )

        loop = AutoDevLoop(root_dir=tmp_path)
        loop.runners = AutoDevRunners(
            loop.config,
            loop.workspace_path,
            mock_writer=mock_writer,
        )

        loop.initialize_roadmap_memory(
            project_name="QuotaTest",
            roadmap_goal="Quota Interruption & Zero-Paid-Fallback Test",
            raw_steps=[
                {
                    "step_id": "ADIM-001",
                    "title": "Kota Kesintisi Test Adımı",
                    "goal": "Kota sınırı altında bekleyiş ve toparlanma",
                    "dependencies": [],
                    "tags": ["quota", "resilience"],
                    "focus_files": ["quota_test.txt"],
                    "forbidden_paths": ["kurallar/"],
                    "acceptance_criteria": ["quota_test.txt mevcut olmalı"],
                    "test_commands": [],
                    "requires_human_auth": "yok",
                }
            ],
        )

        # Prepare step in active execution state (Tur 1 / RUNNING) before simulating quota exhaustion
        head_sha = loop.get_head_sha()
        loop.state["steps"][0]["status"] = "RUNNING"
        loop.state["steps"][0]["base_commit"] = head_sha
        loop.state["steps"][0]["attempt"] = 1
        loop.state["steps"][0]["local_fix_attempt"] = 0
        loop.state["active_step"] = "ADIM-001"
        loop.state["base_commit"] = head_sha
        loop.state["attempt"] = 1
        loop.state["local_fix_attempt"] = 0
        loop.state["loop_status"] = "RUNNING"
        loop.save_state()

        # 2. Assert Existence of Budget Fields in State and Disk Checkpoint BEFORE execution
        print_assertion(
            "State bütçe alanı varlığı (Global attempt)",
            expected="True ('attempt' key exists in loop.state)",
            actual="attempt" in loop.state,
            success=("attempt" in loop.state),
        )
        assert "attempt" in loop.state, "'attempt' bütçe alanı loop.state içinde bulunmalı!"

        print_assertion(
            "State bütçe alanı varlığı (Global local_fix_attempt)",
            expected="True ('local_fix_attempt' key exists in loop.state)",
            actual="local_fix_attempt" in loop.state,
            success=("local_fix_attempt" in loop.state),
        )
        assert "local_fix_attempt" in loop.state, "'local_fix_attempt' bütçe alanı loop.state içinde bulunmalı!"

        # TAKE AUTHORITATIVE PRE-EXECUTION SNAPSHOT BEFORE ANY EXECUTION CALL UNDER QUOTA (BEFORE res_wait1)
        initial_global_attempt = loop.state["attempt"]
        initial_local_fix = loop.state["local_fix_attempt"]

        initial_disk_state = json.loads((tmp_path / "state.json").read_text(encoding="utf-8"))
        assert "attempt" in initial_disk_state, "'attempt' alanı disk state.json içinde mevcut olmalı"
        assert "local_fix_attempt" in initial_disk_state, "'local_fix_attempt' alanı disk state.json içinde mevcut olmalı"
        initial_disk_attempt = initial_disk_state["attempt"]
        initial_disk_local_fix = initial_disk_state["local_fix_attempt"]

        initial_step = loop.state["steps"][0]
        initial_step_status = initial_step["status"]
        assert "attempt" in initial_step, "'attempt' alanı initial step içinde mevcut olmalı"
        assert "local_fix_attempt" in initial_step, "'local_fix_attempt' alanı initial step içinde mevcut olmalı"
        initial_step_attempt = initial_step["attempt"]
        initial_step_local_fix = initial_step["local_fix_attempt"]

        initial_snapshot = {
            "global_attempt": initial_global_attempt,
            "global_local_fix": initial_local_fix,
            "disk_attempt": initial_disk_attempt,
            "disk_local_fix": initial_disk_local_fix,
            "step_attempt": initial_step_attempt,
            "step_local_fix": initial_step_local_fix,
            "step_status": initial_step_status,
        }
        print(f"[*] [Authoritative Pre-Execution Snapshot] Alındı: {initial_snapshot}")

        # 3. Simulate Quota Exhaustion across all 3 AGY pool accounts
        print("\n[*] Tüm 3 AGY hesabında kota aşımı (RESOURCE_UNAVAILABLE: 429) simüle ediliyor...")
        for slot in loop.runners.pool.slots:
            slot.mark_quota_exhausted(300, "RESOURCE_UNAVAILABLE: Quota limit reached (429 Too Many Requests)")

        print_assertion(
            "AGY hesap havuzu durumu",
            expected="0 kullanılabilir slot (tümü kota beklemesinde)",
            actual=f"{len(loop.runners.pool.get_available_slots())} slot",
            success=(len(loop.runners.pool.get_available_slots()) == 0),
        )
        assert len(loop.runners.pool.get_available_slots()) == 0

        # 4. Attempt initial step execution under exhausted quota -> enters WAIT
        print("[*] Kota sınırında ilk execute_single_step() çağrılıyor (WAIT durumuna giriş)...")
        res_wait1 = loop.execute_single_step()

        print_assertion(
            "Döngü sonucu (Kota kesintisi ilk çağrı)",
            expected="WAIT",
            actual=res_wait1,
            success=(res_wait1 == "WAIT"),
            extra="Scheduler adımı fail/pass yapmadı, WAIT durumuna geçti",
        )
        assert res_wait1 == "WAIT", f"Beklenen WAIT, alınan: {res_wait1}"

        print_assertion(
            "WAIT durumuna geçişte loop_status",
            expected="WAIT",
            actual=loop.state.get("loop_status"),
            success=(loop.state.get("loop_status") == "WAIT"),
        )
        assert loop.state.get("loop_status") == "WAIT"

        # VERIFY POST-WAIT-1 VALUES AGAINST INITIAL SNAPSHOT (FIRST QUOTA DETECTION CONSUMES ZERO BUDGET)
        post_wait1_global_attempt = loop.state["attempt"]
        post_wait1_local_fix = loop.state["local_fix_attempt"]

        post_wait1_disk_state = json.loads((tmp_path / "state.json").read_text(encoding="utf-8"))
        assert "attempt" in post_wait1_disk_state, "'attempt' alanı disk state.json içinde mevcut olmalı"
        print_assertion(
            "İlk WAIT sonrasında Kalıcı state.json içinde local_fix_attempt anahtarı varlığı",
            expected="True ('local_fix_attempt' in post_wait1_disk_state)",
            actual="local_fix_attempt" in post_wait1_disk_state,
            success=("local_fix_attempt" in post_wait1_disk_state),
            extra="Anahtarın silinmediği ve doğrudan [...] erişilebilir olduğu doğrulandı",
        )
        assert "local_fix_attempt" in post_wait1_disk_state, "'local_fix_attempt' alanı disk state.json içinde mevcut olmalı"
        post_wait1_disk_attempt = post_wait1_disk_state["attempt"]
        post_wait1_disk_local_fix = post_wait1_disk_state["local_fix_attempt"]

        post_wait1_step = loop.state["steps"][0]
        post_wait1_step_status = post_wait1_step["status"]
        assert "attempt" in post_wait1_step, "'attempt' alanı post_wait1 memory step içinde mevcut olmalı"
        assert "local_fix_attempt" in post_wait1_step, "'local_fix_attempt' alanı post_wait1 memory step içinde mevcut olmalı"
        post_wait1_step_attempt = post_wait1_step["attempt"]
        post_wait1_step_local_fix = post_wait1_step["local_fix_attempt"]

        # Compare post-WAIT-1 vs initial snapshot values directly
        wait1_attempt_match = (post_wait1_global_attempt == initial_snapshot["global_attempt"])
        print_assertion(
            "İlk WAIT sonrasında Global Attempt bütçesi değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['global_attempt']} == Sonraki: {post_wait1_global_attempt}",
            actual=f"Başlangıç: {initial_snapshot['global_attempt']}, Sonraki: {post_wait1_global_attempt}",
            success=wait1_attempt_match,
            extra="İlk kota tespitinde bütçe kesinlikle harcanmadı!",
        )
        assert wait1_attempt_match, f"İlk WAIT sırasında global attempt değişti! {initial_snapshot['global_attempt']} -> {post_wait1_global_attempt}"

        wait1_local_fix_match = (post_wait1_local_fix == initial_snapshot["global_local_fix"])
        print_assertion(
            "İlk WAIT sonrasında Local Fix Attempt bütçesi değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['global_local_fix']} == Sonraki: {post_wait1_local_fix}",
            actual=f"Başlangıç: {initial_snapshot['global_local_fix']}, Sonraki: {post_wait1_local_fix}",
            success=wait1_local_fix_match,
        )
        assert wait1_local_fix_match

        wait1_disk_attempt_match = (post_wait1_disk_attempt == initial_snapshot["disk_attempt"])
        print_assertion(
            "İlk WAIT sonrasında Kalıcı state.json Disk Attempt değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['disk_attempt']} == Sonraki: {post_wait1_disk_attempt}",
            actual=f"Başlangıç: {initial_snapshot['disk_attempt']}, Sonraki: {post_wait1_disk_attempt}",
            success=wait1_disk_attempt_match,
        )
        assert wait1_disk_attempt_match

        wait1_disk_local_fix_match = (post_wait1_disk_local_fix == initial_snapshot["disk_local_fix"])
        print_assertion(
            "İlk WAIT sonrasında Kalıcı state.json Disk Local Fix değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['disk_local_fix']} == Sonraki: {post_wait1_disk_local_fix}",
            actual=f"Başlangıç: {initial_snapshot['disk_local_fix']}, Sonraki: {post_wait1_disk_local_fix}",
            success=wait1_disk_local_fix_match,
        )
        assert wait1_disk_local_fix_match

        wait1_step_status_match = (post_wait1_step_status == initial_snapshot["step_status"] == "RUNNING")
        print_assertion(
            "İlk WAIT sonrasında Adım Durumu değişmezliği (ve PASS sayılmama garantisi)",
            expected=f"Başlangıç: {initial_snapshot['step_status']} (ve != PASS)",
            actual=post_wait1_step_status,
            success=wait1_step_status_match and (post_wait1_step_status != "PASS"),
        )
        assert wait1_step_status_match and (post_wait1_step_status != "PASS")

        wait1_step_attempt_match = (post_wait1_step_attempt == initial_snapshot["step_attempt"])
        print_assertion(
            "İlk WAIT sonrasında Adım Düzeyi Attempt sayacı değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=initial_snapshot["step_attempt"],
            actual=post_wait1_step_attempt,
            success=wait1_step_attempt_match,
        )
        assert wait1_step_attempt_match

        wait1_step_local_fix_match = (post_wait1_step_local_fix == initial_snapshot["step_local_fix"])
        print_assertion(
            "İlk WAIT sonrasında Adım Düzeyi Local Fix Attempt sayacı değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=initial_snapshot["step_local_fix"],
            actual=post_wait1_step_local_fix,
            success=wait1_step_local_fix_match,
        )
        assert wait1_step_local_fix_match

        # 5. Trigger subsequent execution tick WHILE STILL UNDER QUOTA EXHAUSTION (WAIT period)
        print("\n[*] Kota beklemesi devam ederken (WAIT periyodunda) ikinci bir tick/çağrı simüle ediliyor...")
        res_wait2 = loop.execute_single_step()

        print_assertion(
            "Kota doluyken tekrarlanan tick sonucu",
            expected="WAIT",
            actual=res_wait2,
            success=(res_wait2 == "WAIT"),
        )
        assert res_wait2 == "WAIT", f"Kota doluyken tekrar çağrıda beklenen WAIT, alınan: {res_wait2}"

        # VERIFY POST-WAIT-2 VALUES AGAINST INITIAL SNAPSHOT (REPEATED TICKS CONSUME ZERO BUDGET)
        post_wait2_global_attempt = loop.state["attempt"]
        post_wait2_local_fix = loop.state["local_fix_attempt"]

        post_wait2_disk_state = json.loads((tmp_path / "state.json").read_text(encoding="utf-8"))
        assert "attempt" in post_wait2_disk_state, "'attempt' alanı disk state.json içinde mevcut olmalı"
        print_assertion(
            "İkinci WAIT sonrasında Kalıcı state.json içinde local_fix_attempt anahtarı varlığı",
            expected="True ('local_fix_attempt' in post_wait2_disk_state)",
            actual="local_fix_attempt" in post_wait2_disk_state,
            success=("local_fix_attempt" in post_wait2_disk_state),
            extra="Anahtarın silinmediği ve doğrudan [...] erişilebilir olduğu doğrulandı",
        )
        assert "local_fix_attempt" in post_wait2_disk_state, "'local_fix_attempt' alanı disk state.json içinde mevcut olmalı"
        post_wait2_disk_attempt = post_wait2_disk_state["attempt"]
        post_wait2_disk_local_fix = post_wait2_disk_state["local_fix_attempt"]

        post_wait2_step = loop.state["steps"][0]
        post_wait2_step_status = post_wait2_step["status"]
        assert "attempt" in post_wait2_step, "'attempt' alanı post_wait2 memory step içinde mevcut olmalı"
        assert "local_fix_attempt" in post_wait2_step, "'local_fix_attempt' alanı post_wait2 memory step içinde mevcut olmalı"
        post_wait2_step_attempt = post_wait2_step["attempt"]
        post_wait2_step_local_fix = post_wait2_step["local_fix_attempt"]

        wait2_attempt_match = (post_wait2_global_attempt == initial_snapshot["global_attempt"])
        print_assertion(
            "İkinci WAIT sonrasında Global Attempt bütçesi değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['global_attempt']} == Sonraki: {post_wait2_global_attempt}",
            actual=f"Başlangıç: {initial_snapshot['global_attempt']}, Sonraki: {post_wait2_global_attempt}",
            success=wait2_attempt_match,
            extra="Kota beklemesi sırasında REWORK tur hakkı ASLA harcanmadı!",
        )
        assert wait2_attempt_match, f"İkinci WAIT sırasında global attempt değişti! {initial_snapshot['global_attempt']} -> {post_wait2_global_attempt}"

        wait2_local_fix_match = (post_wait2_local_fix == initial_snapshot["global_local_fix"])
        print_assertion(
            "İkinci WAIT sonrasında Local Fix Attempt bütçesi değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['global_local_fix']} == Sonraki: {post_wait2_local_fix}",
            actual=f"Başlangıç: {initial_snapshot['global_local_fix']}, Sonraki: {post_wait2_local_fix}",
            success=wait2_local_fix_match,
        )
        assert wait2_local_fix_match

        wait2_disk_attempt_match = (post_wait2_disk_attempt == initial_snapshot["disk_attempt"])
        print_assertion(
            "İkinci WAIT sonrasında Kalıcı state.json Disk Attempt değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['disk_attempt']} == Sonraki: {post_wait2_disk_attempt}",
            actual=f"Başlangıç: {initial_snapshot['disk_attempt']}, Sonraki: {post_wait2_disk_attempt}",
            success=wait2_disk_attempt_match,
        )
        assert wait2_disk_attempt_match

        wait2_disk_local_fix_match = (post_wait2_disk_local_fix == initial_snapshot["disk_local_fix"])
        print_assertion(
            "İkinci WAIT sonrasında Kalıcı state.json Disk Local Fix değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=f"Başlangıç: {initial_snapshot['disk_local_fix']} == Sonraki: {post_wait2_disk_local_fix}",
            actual=f"Başlangıç: {initial_snapshot['disk_local_fix']}, Sonraki: {post_wait2_disk_local_fix}",
            success=wait2_disk_local_fix_match,
        )
        assert wait2_disk_local_fix_match

        wait2_step_status_match = (post_wait2_step_status == initial_snapshot["step_status"] == "RUNNING")
        print_assertion(
            "İkinci WAIT süresince Adım Durumu değişmezliği (ve PASS sayılmama garantisi)",
            expected=f"Başlangıç: {initial_snapshot['step_status']} (ve != PASS)",
            actual=post_wait2_step_status,
            success=wait2_step_status_match and (post_wait2_step_status != "PASS"),
        )
        assert wait2_step_status_match and (post_wait2_step_status != "PASS")

        wait2_step_attempt_match = (post_wait2_step_attempt == initial_snapshot["step_attempt"])
        print_assertion(
            "İkinci WAIT sonrasında Adım Düzeyi Attempt sayacı değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=initial_snapshot["step_attempt"],
            actual=post_wait2_step_attempt,
            success=wait2_step_attempt_match,
        )
        assert wait2_step_attempt_match

        wait2_step_local_fix_match = (post_wait2_step_local_fix == initial_snapshot["step_local_fix"])
        print_assertion(
            "İkinci WAIT sonrasında Adım Düzeyi Local Fix Attempt sayacı değişmezliği (Başlangıç Snapshot karşılaştırması)",
            expected=initial_snapshot["step_local_fix"],
            actual=post_wait2_step_local_fix,
            success=wait2_step_local_fix_match,
        )
        assert wait2_step_local_fix_match

        print_assertion(
            "Kota sınırındayken Writer çağrılmama kontrolü",
            expected="0 çağrı",
            actual=f"{writer_call_count} çağrı",
            success=(writer_call_count == 0),
        )
        assert writer_call_count == 0, "Kota sınırındayken writer çağrılmamalıydı!"

        wait_reason = loop.state.get("wait_reason", "")
        has_zero_paid_guarantee = "Codex yazıcıya geçilmedi" in wait_reason
        print_assertion(
            "Ücretli fallback açmama garantisi (Zero-Paid-Fallback)",
            expected="True (Codex yazıcıya geçilmedi uyarısı mevcut)",
            actual=wait_reason,
            success=has_zero_paid_guarantee,
            extra="Tüm AGY slotları tıkalıyken denetçi Codex yazıcı fallback'i olarak kullanılmadı",
        )
        assert has_zero_paid_guarantee, f"wait_reason içinde sıfır ücretli fallback garantisi bulunamadı: {wait_reason}"

        # 6. Simulate Quota Reset / Resource Availability
        print("\n[*] Kota bekleme süresi (cooldown) doldu; AGY slotları yeniden etkinleşiyor...")
        for slot in loop.runners.pool.slots:
            slot.cooldown_until = 0.0

        def mock_reviewer(step_id: str, prompt: str, attempt: int) -> RunnerResponse:
            return RunnerResponse(
                outcome="OK",
                provider="CODEX",
                account_id="Codex-ReadOnly",
                summary="Kota sonrası görev bağımsız denetimden geçti.",
                payload={
                    "verdict": "PASS",
                    "issues": [],
                    "decisions_taken": ["Kota kesintisi sonrası ilk geçerli denemede kabul onaylandı."],
                },
            )

        loop.runners.mock_reviewer = mock_reviewer

        # 7. Re-execute step after quota restored
        print("[*] Kota açıldıktan sonra execute_single_step() yeniden çağrılıyor...")
        res_pass = loop.execute_single_step()

        print_assertion(
            "Kota sonrası yeniden yürütme sonucu",
            expected="PASS",
            actual=res_pass,
            success=(res_pass == "PASS"),
        )
        assert res_pass == "PASS", f"Kota sıfırlandıktan sonra PASS alınmalıydı: {res_pass}"

        final_step_status = loop.state["steps"][0]["status"]
        print_assertion(
            "Adımın nihai durumu",
            expected="PASS",
            actual=final_step_status,
            success=(final_step_status == "PASS"),
        )
        assert final_step_status == "PASS"

        print_assertion(
            "Kota sonrası Writer çağrı sayısı",
            expected="1 (kota açılınca tam 1 kez çalıştırıldı)",
            actual=f"{writer_call_count} çağrı",
            success=(writer_call_count == 1),
        )
        assert writer_call_count == 1

        step_commit = loop.state["steps"][0].get("result_commit", "")
        print_assertion(
            "Nihai kabul Git commit kaydı",
            expected="Geçerli commit SHA",
            actual=step_commit[:8] if step_commit else "YOK",
            success=bool(step_commit),
        )
        assert step_commit, "Kota sonrası tamamlanan görev için commit üretilmeliydi!"

        # Structured Telemetry Output for Scenario 2
        telemetry_2 = {
            "scenario": "SENARYO_2_QUOTA_INTERRUPTION_AND_ZERO_PAID_FALLBACK",
            "verdict": "PASS",
            "isolation": {
                "temp_workspace": str(tmp_path),
                "is_isolated_from_host": is_isolated,
            },
            "quota_interruption_phase": {
                "agy_slots_exhausted": 3,
                "execution_results": [res_wait1, res_wait2],
                "loop_status": loop.state.get("loop_status"),
                "step_status": post_wait2_step_status,
                "budget_verification": {
                    "field_exists_in_state": True,
                    "field_exists_in_disk_checkpoint": True,
                    "authoritative_initial_snapshot": initial_snapshot,
                    "post_wait1_counters": {
                        "global_attempt": post_wait1_global_attempt,
                        "global_local_fix": post_wait1_local_fix,
                        "disk_attempt": post_wait1_disk_attempt,
                        "disk_local_fix": post_wait1_disk_local_fix,
                        "step_attempt": post_wait1_step_attempt,
                        "step_local_fix": post_wait1_step_local_fix,
                        "step_status": post_wait1_step_status,
                        "matches_initial_snapshot_1_to_1": (
                            wait1_attempt_match
                            and wait1_local_fix_match
                            and wait1_disk_attempt_match
                            and wait1_disk_local_fix_match
                            and wait1_step_status_match
                            and wait1_step_attempt_match
                            and wait1_step_local_fix_match
                        ),
                    },
                    "post_wait2_counters": {
                        "global_attempt": post_wait2_global_attempt,
                        "global_local_fix": post_wait2_local_fix,
                        "disk_attempt": post_wait2_disk_attempt,
                        "disk_local_fix": post_wait2_disk_local_fix,
                        "step_attempt": post_wait2_step_attempt,
                        "step_local_fix": post_wait2_step_local_fix,
                        "step_status": post_wait2_step_status,
                        "matches_initial_snapshot_1_to_1": (
                            wait2_attempt_match
                            and wait2_local_fix_match
                            and wait2_disk_attempt_match
                            and wait2_disk_local_fix_match
                            and wait2_step_status_match
                            and wait2_step_attempt_match
                            and wait2_step_local_fix_match
                        ),
                    },
                    "zero_budget_consumed_first_quota_detection": wait1_attempt_match and wait1_local_fix_match,
                    "zero_budget_consumed_repeated_quota_tick": wait2_attempt_match and wait2_local_fix_match,
                },
                "writer_call_count_during_quota": 0,
                "zero_paid_fallback_enforced": has_zero_paid_guarantee,
                "wait_reason": wait_reason,
            },
            "recovery_phase": {
                "cooldown_reset": True,
                "execution_result": res_pass,
                "final_step_status": final_step_status,
                "total_writer_calls": writer_call_count,
                "result_commit": step_commit,
            },
        }
        print_structured_telemetry("Senaryo 2 Kota Kesintisi ve Ücretsiz Kalma Kanıtı", telemetry_2)

        print("  🎉 Senaryo 2 BAŞARIYLA TAMAMLANDI (Kota Kesintisi WAIT -> Bütçe Harcamama -> Ücretli Fallback Açmama -> Başarılı İlerleme).")
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
        extra="Test çalışmaları host Git geçmişine yetkisiz/boş commit eklemedi",
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
    pre_lines = set(baseline_info["status"].splitlines()) if baseline_info["status"] else set()
    post_lines = set(post_info["status"].splitlines()) if post_info["status"] else set()

    # Identify any newly introduced dirty paths (excluding test script itself if untracked)
    new_dirty_lines = [
        l for l in post_lines
        if l not in pre_lines and "tests/run_recovery_and_quota_test.py" not in l
    ]
    no_leakage = (len(new_dirty_lines) == 0)
    print_assertion(
        "Host çalışma ağacı kirlenme kontrolü (Dosya sızıntısı yasağı)",
        expected="Sıfır yeni kirli/değişik dosya (no leakage)",
        actual=f"{len(new_dirty_lines)} yeni dosya: {new_dirty_lines}" if new_dirty_lines else "Temiz",
        success=no_leakage,
        extra="Geçici senaryo dosyaları (ADIM-001.txt, quota_test.txt vb.) host çalışma ağacına sızmadı",
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
    print("🧪 ADIM-005: AUTODEV RESTART RECOVERY & QUOTA RESILIENCE TEST")
    print("   (Senaryo 1: Restart Recovery [Ayrı Subprocess] | Senaryo 2: Quota & Zero-Paid | İzolasyon)")
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
        ok_rec = run_restart_recovery_test(host_workspace, git_bin)
        ok_quota = run_quota_interruption_test(host_workspace, git_bin)
        ok_iso = run_host_isolation_check(host_workspace, git_bin, baseline_info)

        if ok_rec and ok_quota and ok_iso:
            print("\n" + "=" * 80)
            print("🎉 TÜM RECOVERY VE KOTA SENARYOLARI (RECOVERY + QUOTA + İZOLASYON) BAŞARIYLA GEÇTİ!")
            print("=" * 80)
            return 0
        return 1
    except Exception as e:
        print(f"\n❌ TEST BAŞARISIZ OLDU: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--worker-phase-1":
        sys.exit(worker_phase_1(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()))
    elif len(sys.argv) >= 4 and sys.argv[1] == "--worker-phase-2":
        sys.exit(worker_phase_2(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()))
    else:
        sys.exit(main())
