# LARI Nomenclature & Historical Milestone Mapping

## Overview

Over the course of development, LARI has used several naming systems across git commit messages, architecture decision records, and test harnesses. This document maps historical naming conventions to prevent nomenclature drift.

---

## Nomenclature Mapping Table

| Historical / System Name | Canonical Scope | Context & Relationship |
| :--- | :--- | :--- |
| **Legacy Phase A-H** | Initial Pilot Operational Roadmap | Phase A through H1E established initial database schema, pilot data cleanup (`P1D.1A`), and paymentless pilot authorization. |
| **Stage H1A - H1E** | Commercial Refactor Stages | Introduced immutable catalog versioning (H1A), Super Admin commercial RPCs (H1B/H1D), commercial eligibility (H1C), and release gates (H1E). |
| **P1 / P1D** | Pilot Arming & Data Safety | `P1D.1A` focused on cleanup of compromised credentials, verification of Canary A surviving appointments, and read-only arming. |
| **P2A (P2A.0 - P2A.3)** | Commercial Core Foundation | Parallel workstream for server-authoritative tenant provisioning (`P2A.0`), commercial alignment (`P2A.1`), owner onboarding contracts (`P2A.2`), and onboarding state handoff (`P2A.3`). |
| **CORE-RC (1 - 4)** | Core Release Candidates | Hardened core release candidate milestones. `CORE-RC.1` (domain), `CORE-RC.2B` (authorization), `CORE-RC.3` (runtime proof/hold), `CORE-RC.4` (final RC). |

---

## Clarifications & Anti-Drift Rules

1. **`P2A` is Commercial Core Foundation**: `P2A` represents the Commercial Core Foundation workstream. It is NOT proof that a `P2B` master phase must exist.
2. **`UI V2` is a Parallel Lane**: `UI V2` refers to frontend component modernization. It is NOT a roadmap phase and does NOT alter the core database delivery train.
3. **Canonical Forward Sequence**: Only `docs/project-control/ROADMAP_12W.md` defines the current canonical forward delivery sequence.
