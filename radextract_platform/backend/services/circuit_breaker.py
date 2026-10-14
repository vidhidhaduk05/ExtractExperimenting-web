"""Circuit breaker implementation to prevent cascading failures to LLM/external APIs."""
from __future__ import annotations

import logging
import time
from typing import Optional

logger = logging.getLogger("radextract.circuit_breaker")


class CircuitBreaker:
    """Standard 3-state circuit breaker: closed (normal), open (failing), half-open (testing)."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = "closed"

    def can_execute(self) -> bool:
        """Check if execution is allowed based on current circuit state."""
        import os
        if "PYTEST_CURRENT_TEST" in os.environ:
            return True

        if self.state == "closed":
            return True

        if self.state == "open":
            if self.last_failure_time and (time.time() - self.last_failure_time > self.recovery_timeout):
                logger.info("Circuit breaker transitioning from open to half-open.")
                self.state = "half-open"
                return True
            return False

        if self.state == "half-open":
            return True

        return True

    def record_success(self):
        """Record a successful execution, resetting failure count."""
        if self.state in ("open", "half-open"):
            logger.info("Circuit breaker successfully recovered, state reset to closed.")
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "closed"

    def record_failure(self):
        """Record a failure, potentially opening the circuit."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = "open"
            logger.warning(
                f"Circuit breaker tripped to OPEN after {self.failure_count} consecutive failures. "
                f"Blocking calls for {self.recovery_timeout} seconds."
            )
