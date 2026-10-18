#!/usr/bin/env python3
"""Render systematic review Markdown to PDF using Pandoc and LaTeX/Weasyprint."""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def check_dependencies():
    """Check whether pandoc or weasyprint is installed."""
    has_pandoc = shutil.which("pandoc") is not None
    has_xelatex = shutil.which("xelatex") is not None
    has_weasyprint = shutil.which("weasyprint") is not None

    if has_pandoc and has_xelatex:
        return "pandoc-xelatex"
    elif has_weasyprint:
        return "weasyprint"
    elif has_pandoc:
        return "pandoc"
    return None


def generate_pdf(markdown_file: str, output_pdf: str = None) -> bool:
    source = Path(markdown_file).resolve()
    destination = Path(output_pdf).resolve() if output_pdf else source.with_suffix(".pdf")

    engine = check_dependencies()
    if not engine:
        print("Note: Neither pandoc+xelatex nor weasyprint found on system PATH. Markdown saved without PDF conversion.", file=sys.stderr)
        return False

    try:
        if engine == "pandoc-xelatex":
            cmd = [
                "pandoc", str(source), "-o", str(destination),
                "--pdf-engine=xelatex",
                "-V", "geometry:margin=1in",
                "-V", "fontsize=11pt",
                "--toc"
            ]
            subprocess.run(cmd, check=True)
            print(f"[OK] Rendered PDF to {destination}")
            return True
    except Exception as e:
        print(f"[FAIL] Rendering failed: {e}", file=sys.stderr)
        return False
    return False


def main():
    parser = argparse.ArgumentParser(description="Generate PDF from Systematic Review Markdown.")
    parser.add_argument("markdown_file", help="Input markdown document")
    parser.add_argument("-o", "--output", help="Output PDF filename")
    args = parser.parse_args()

    generate_pdf(args.markdown_file, args.output)


if __name__ == "__main__":
    main()
