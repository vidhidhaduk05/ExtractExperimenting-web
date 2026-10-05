# Database Search Strategies & API Specifications

This guide outlines explicit search strategies, query syntax, and API endpoints across major biomedical and scientific literature databases.

## 1. PubMed / MEDLINE (NCBI)

- **Access Route**: NCBI E-utilities API (`esearch`, `esummary`, `efetch`) or PubMed web interface.
- **Base Endpoint**: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
- **Query Syntax Rules**:
  - Use field tags: `[tiab]` for Title/Abstract, `[mesh]` for Medical Subject Headings.
  - Capitalize Boolean operators: `AND`, `OR`, `NOT`.
  - Date filtering: `2015:2026[dp]` or `2020/01/01:2026/12/31[pdat]`.
  - Publication types: `clinical trial[pt]`, `randomized controlled trial[pt]`, `review[pt]`.
- **Example Systematic Search String**:
  ```
  ("artificial intelligence"[tiab] OR "deep learning"[tiab] OR "convolutional neural network"[tiab])
  AND ("radiology"[tiab] OR "computed tomography"[tiab] OR "CT"[tiab] OR "MRI"[tiab])
  AND ("pulmonary nodule"[mesh] OR "lung neoplasm"[mesh] OR "lung cancer"[tiab])
  AND 2020:2026[dp] AND English[la]
  ```

## 2. arXiv (Physics, Math, Computer Science, Quantitative Biology)

- **Access Route**: arXiv public REST API (`http://export.arxiv.org/api/query`).
- **Fields**: `ti:` (Title), `abs:` (Abstract), `cat:` (Subject Category), `au:` (Author).
- **Subject Categories**:
  - `cs.CV`: Computer Vision
  - `cs.AI`: Artificial Intelligence
  - `q-bio.QM`: Quantitative Methods
  - `stat.ML`: Machine Learning
- **Query Example**:
  ```
  http://export.arxiv.org/api/query?search_query=all:radiology+AND+cat:cs.CV&start=0&max_results=50&sortBy=submittedDate&sortOrder=descending
  ```

## 3. bioRxiv & medRxiv (Cold Spring Harbor Laboratory)

- **Access Route**: API v2 (`https://api.biorxiv.org/details/[server]/[interval]/[cursor]`).
- **Server Options**: `biorxiv` or `medrxiv`.
- **Interval Format**: `YYYY-MM-DD/YYYY-MM-DD` (e.g. `2024-01-01/2026-10-01`).
- **Preprint Tagging**: Always explicitly flag records from these servers with `is_preprint: true`.

## 4. Semantic Scholar Graph API

- **Access Route**: `https://api.semanticscholar.org/graph/v1/paper/search`.
- **Query Parameters**:
  - `query`: Free-text or keyword string.
  - `fields`: `paperId,title,abstract,authors,year,citationCount,isOpenAccess,externalIds`.
  - `limit`: Up to 100 per page.
  - `year`: E.g. `2020-2026`.
