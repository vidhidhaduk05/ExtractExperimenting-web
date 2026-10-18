"""In-memory rate limiter to protect endpoints against denial of service and abuse."""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Dict, List


class RateLimiter:
    """Sliding-window in-memory rate limiter."""

    def __init__(self, max_requests: int = 120, window_seconds: float = 60.0):
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests: Dict[str, List[float]] = defaultdict(list)

    def check(self, key: str) -> bool:
        """Check if request for key (IP address or token) is within rate limit."""
        now = time.time()
        # Keep only timestamps within window
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        if len(self.requests[key]) >= self.max_requests:
            return False
        self.requests[key].append(now)
        return True

    def reset(self):
        """Reset all rate limiter state."""
        self.requests.clear()
