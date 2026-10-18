"""Structured JSON logging configuration for production and CloudWatch."""
import json
import logging
import sys


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


def setup_logging(level: str = "INFO", json_format: bool = False):
    """Configure root logger with either standard or structured JSON formatting."""
    root = logging.getLogger()
    root.setLevel(level)

    # Avoid duplicate handlers
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        if json_format:
            handler.setFormatter(JSONFormatter())
        else:
            handler.setFormatter(
                logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
            )
        root.addHandler(handler)
