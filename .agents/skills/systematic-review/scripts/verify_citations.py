#!/usr/bin/env python3
"""Check DOI registration and retrieve Crossref metadata for citation review.

Adapted from K-Dense-AI systematic-reviewer & scholar-evaluation skills.
Ensures:
  1. Structural DOI syntax validation.
  2. Official DOI handle verification (https://doi.org/api/handles/).
  3. Crossref metadata enrichment and publication verification.
  4. Detection and tagging of preprints vs peer-reviewed records.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import quote, unquote

try:
    import requests
except ImportError:
    print("Warning: requests library not found. Falling back to urllib.", file=sys.stderr)
    import urllib.request
    import urllib.error
    requests = None


def normalize_doi(value: str) -> str:
    """Normalize a bare DOI or doi.org URL without stripping legal DOI punctuation."""
    if not value:
        return ""
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value.strip(), flags=re.I)
    return unquote(value).lower()


class CitationVerifier:
    def __init__(self, email: str = "review-agent@k-dense.ai"):
        self.email = email
        if requests:
            self.session = requests.Session()
            self.session.headers.update({
                'User-Agent': f'SystematicReviewCitationVerifier/2.0 (mailto:{self.email})'
            })
        else:
            self.session = None

    def extract_dois(self, text: str) -> List[str]:
        """Extract unique candidate DOIs from text."""
        found = []
        for candidate in re.findall(r'10\.\d{4,9}/[^\s<>"{}]+', text, flags=re.I):
            candidate = unquote(candidate).rstrip('.,;:')
            while candidate and candidate[-1] in ')]':
                closing = candidate[-1]
                opening = '(' if closing == ')' else '['
                if candidate.count(closing) <= candidate.count(opening):
                    break
                candidate = candidate[:-1].rstrip('.,;:')
            candidate = normalize_doi(candidate)
            if candidate and candidate not in found:
                found.append(candidate)
        return found

    def verify_doi_handle(self, doi: str) -> Tuple[bool, Dict[str, Any]]:
        """Verify existence via official doi.org handle API."""
        doi = normalize_doi(doi)
        if not re.fullmatch(r'10\.\d{4,9}/\S+', doi):
            return False, {'doi': doi, 'status': 'invalid_syntax'}

        url = f"https://doi.org/api/handles/{quote(doi, safe='/')}"
        try:
            if self.session:
                resp = self.session.get(url, timeout=15)
                if resp.status_code == 200:
                    payload = resp.json()
                    if payload.get('responseCode') == 1:
                        return True, {'doi': doi, 'status': 'active_handle', 'handle': payload.get('handle')}
            else:
                req = urllib.request.Request(url, headers={'User-Agent': 'SystematicReviewCitationVerifier/2.0'})
                with urllib.request.urlopen(req, timeout=15) as r:
                    if r.status == 200:
                        payload = json.loads(r.read().decode('utf-8'))
                        if payload.get('responseCode') == 1:
                            return True, {'doi': doi, 'status': 'active_handle', 'handle': payload.get('handle')}
        except Exception as e:
            return False, {'doi': doi, 'status': 'query_failed', 'error': str(e)}

        return False, {'doi': doi, 'status': 'not_found'}

    def fetch_crossref_metadata(self, doi: str) -> Tuple[bool, Dict[str, Any]]:
        """Retrieve authoritative metadata from Crossref."""
        doi = normalize_doi(doi)
        url = f"https://api.crossref.org/works/{quote(doi, safe='/')}"
        try:
            if self.session:
                resp = self.session.get(url, timeout=20)
                if resp.status_code == 200:
                    item = resp.json().get('message', {})
                    return True, {
                        'doi': doi,
                        'title': (item.get('title') or [''])[0],
                        'authors': [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in item.get('author', [])],
                        'year': item.get('created', {}).get('date-parts', [[None]])[0][0],
                        'container': (item.get('container-title') or [''])[0],
                        'type': item.get('type', ''),
                        'is_preprint': item.get('type') == 'posted-content',
                    }
        except Exception as e:
            return False, {'doi': doi, 'error': str(e)}

        return False, {'doi': doi, 'status': 'not_found_on_crossref'}

    def verify_manuscript(self, text: str) -> Dict[str, Any]:
        """Extract and verify all DOIs in manuscript text."""
        dois = self.extract_dois(text)
        results = []
        valid_count = 0
        for doi in dois:
            handle_ok, handle_info = self.verify_doi_handle(doi)
            cr_ok, cr_meta = self.fetch_crossref_metadata(doi)
            is_valid = handle_ok or cr_ok
            if is_valid:
                valid_count += 1
            results.append({
                'doi': doi,
                'valid': is_valid,
                'handle_status': handle_info.get('status'),
                'crossref_metadata': cr_meta if cr_ok else None
            })
            time.sleep(0.1)  # polite rate-limiting

        return {
            'total_dois_found': len(dois),
            'verified_dois': valid_count,
            'verification_rate': (valid_count / len(dois)) if dois else 1.0,
            'details': results
        }


def main():
    parser = argparse.ArgumentParser(description="Verify citation DOIs against official registries.")
    parser.add_argument("input_path", help="Path to markdown/text file or single DOI string")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    args = parser.parse_args()

    verifier = CitationVerifier()
    p = Path(args.input_path)

    if p.exists() and p.is_file():
        content = p.read_text(encoding="utf-8", errors="ignore")
        report = verifier.verify_manuscript(content)
    else:
        # Check as bare DOI
        single_doi = normalize_doi(args.input_path)
        handle_ok, h_info = verifier.verify_doi_handle(single_doi)
        cr_ok, cr_info = verifier.fetch_crossref_metadata(single_doi)
        report = {
            'doi': single_doi,
            'handle_verified': handle_ok,
            'crossref_verified': cr_ok,
            'metadata': cr_info if cr_ok else h_info
        }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Citation Verification Report:")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
