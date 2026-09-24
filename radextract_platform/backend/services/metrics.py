"""Lightweight in-memory metrics collector for request counts, latencies, and errors."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List


class MetricsCollector:
    """Tracks latency percentiles and error counts per API route."""

    def __init__(self):
        self.request_count: Dict[str, int] = defaultdict(int)
        self.response_times: Dict[str, List[float]] = defaultdict(list)
        self.error_count: Dict[str, int] = defaultdict(int)

    def record_request(self, endpoint: str, duration_ms: float, success: bool = True):
        self.request_count[endpoint] += 1
        self.response_times[endpoint].append(duration_ms)
        # Keep last 500 samples per endpoint to bound memory
        if len(self.response_times[endpoint]) > 500:
            self.response_times[endpoint] = self.response_times[endpoint][-500:]
        if not success:
            self.error_count[endpoint] += 1

    def get_stats(self) -> Dict[str, Any]:
        stats: Dict[str, Any] = {}
        for ep, count in self.request_count.items():
            times = self.response_times.get(ep, [])
            avg_time = (sum(times) / len(times)) if times else 0.0
            errors = self.error_count.get(ep, 0)
            stats[ep] = {
                "total_requests": count,
                "error_count": errors,
                "avg_latency_ms": round(avg_time, 2),
                "p95_latency_ms": round(sorted(times)[int(len(times) * 0.95)], 2) if times else 0.0,
            }
        return stats


# Global metrics singleton
metrics_collector = MetricsCollector()
