"""Structured decision trace for auditable statistical analyses.

Every modeling decision is recorded at decision time with the alternatives
considered, the rationale, and the software environment. The trace serializes
to JSON and is the input to tripod_check.py.

Usage:
    trace = DecisionTrace("nwu_progression", seed=2024)
    trace.log("spline_knots", chosen=4, alternatives=[3, 5],
              rationale="LR test P=.001 vs linear; r=0.99 between residuals")
    trace.save("decision_trace.json")
"""

from __future__ import annotations

import datetime
import importlib.metadata
import json
import platform
from pathlib import Path
from typing import Any

_CORE_PACKAGES = ("numpy", "pandas", "scikit-learn", "statsmodels", "scipy", "lifelines")


class DecisionTrace:
    """Append-only log of statistical decisions made during an analysis."""

    def __init__(self, analysis_id: str, seed: int | None = None) -> None:
        self.analysis_id = analysis_id
        self.created = datetime.datetime.now(datetime.UTC).isoformat()
        self.seed = seed
        self.entries: list[dict[str, Any]] = []
        self.log("environment", chosen=self._environment(), rationale="recorded at trace creation")

    @staticmethod
    def _environment() -> dict[str, str]:
        def _version(pkg: str) -> str:
            try:
                return importlib.metadata.version(pkg)
            except importlib.metadata.PackageNotFoundError:
                return "not installed"
        versions = {pkg: _version(pkg) for pkg in _CORE_PACKAGES}
        versions["python"] = platform.python_version()
        return versions

    def log(self, decision: str, *, chosen: Any, alternatives: Any = None,
            rationale: str = "", stage: str = "analysis") -> None:
        """Record one decision. `alternatives` documents what was rejected and why."""
        entry = {
            "stage": stage,
            "decision": decision,
            "chosen": chosen,
            "alternatives": alternatives,
            "rationale": rationale,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        }
        self.entries.append(entry)

    def branch(self, stage: str) -> "_StageContext":
        """Context manager grouping entries under one analysis stage."""
        return _StageContext(self, stage)

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_id": self.analysis_id,
            "created": self.created,
            "seed": self.seed,
            "n_decisions": len(self.entries),
            "decisions": self.entries,
        }

    def save(self, path: str | Path) -> Path:
        path = Path(path)
        path.write_text(json.dumps(self.to_dict(), indent=2, default=str), encoding="utf-8")
        return path


class _StageContext:
    def __init__(self, trace: DecisionTrace, stage: str) -> None:
        self._trace = trace
        self._stage = stage

    def __enter__(self) -> DecisionTrace:
        self._trace.entries.append({"stage": self._stage, "decision": "BEGIN", "chosen": None})
        return self._trace

    def __exit__(self, *exc: object) -> None:
        self._trace.entries.append({"stage": self._stage, "decision": "END", "chosen": None})

    def log(self, decision: str, **kwargs: Any) -> None:
        self._trace.log(decision, stage=self._stage, **kwargs)
