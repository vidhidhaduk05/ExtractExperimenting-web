"""AI screening prioritization service.

Trains a TF-IDF + LogisticRegression classifier on existing screening
decisions (Include/Exclude) and predicts include-probability for pending
studies. Pending studies are sorted by predicted probability so reviewers
see the most likely-relevant studies first.

Requires a minimum of 20 decisions (10 include + 10 exclude) to train.
This threshold is lower than Rayyan's 50 to be useful for smaller reviews.
The classifier is upgradeable to SVM or transformer-based models later.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend

MIN_INCLUDE = 10
MIN_EXCLUDE = 10
MIN_TOTAL = 20

# Color mapping for PICO highlighting
PICO_COLORS = {
    "population": "purple",
    "index_test": "blue",
    "comparator": "blue",
    "outcome": "orange",
}


def _get_training_data(db: DBBackend, project_id: str):
    """Get training data from screening_decisions and studies table.

    Returns (texts, labels) where texts are abstracts and labels are
    1 for included, 0 for excluded.
    """
    studies = {s["study_id"]: s for s in db.query("studies", {"project_id": project_id})}
    decisions = db.query("screening_decisions", {"project_id": project_id})

    seen_study_ids = set()
    texts = []
    labels = []

    for d in decisions:
        dec = d.get("decision")
        if dec not in ("included", "excluded"):
            continue
        sid = d.get("study_id")
        if sid in seen_study_ids:
            continue
        s = studies.get(sid)
        if not s:
            continue
        abstract = s.get("abstract") or ""
        if not abstract.strip():
            continue
        seen_study_ids.add(sid)
        text = (s.get("title") or "") + " " + abstract
        texts.append(text.strip())
        labels.append(1 if dec == "included" else 0)

    # Also check legacy studies table
    for sid, s in studies.items():
        if sid in seen_study_ids:
            continue
        status = s.get("screening_status")
        if status in ("included", "excluded"):
            abstract = s.get("abstract") or ""
            if not abstract.strip():
                continue
            seen_study_ids.add(sid)
            text = (s.get("title") or "") + " " + abstract
            texts.append(text.strip())
            labels.append(1 if status == "included" else 0)

    return texts, labels


def _get_pending_studies(db: DBBackend, project_id: str):
    """Get pending studies that haven't been screened yet."""
    studies = db.query("studies", {"project_id": project_id})
    decisions = db.query("screening_decisions", {"project_id": project_id})
    decided_study_ids = {d.get("study_id") for d in decisions}

    pending = []
    for s in studies:
        if s.get("screening_status") == "pending" and (s.get("abstract") or "").strip():
            if s["study_id"] not in decided_study_ids:
                pending.append(s)

    pending.sort(key=lambda x: x.get("title", ""))
    return pending


def prioritize_studies(project_id: str, db: Optional[DBBackend] = None) -> dict:
    """Train a classifier on existing decisions and prioritize pending studies.

    Returns dict with:
      - project_id
      - model_trained: bool
      - n_training_samples: int
      - n_pending: int
      - prioritized_studies: list of {study_id, title, score, ...}
      - message: str
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    import numpy as np

    db = db or get_db_backend()
    try:
        texts, labels = _get_training_data(db, project_id)

        n_include = sum(1 for l in labels if l == 1)
        n_exclude = sum(1 for l in labels if l == 0)

        if n_include < MIN_INCLUDE or n_exclude < MIN_EXCLUDE:
            return {
                "project_id": project_id,
                "model_trained": False,
                "n_training_samples": len(texts),
                "n_pending": 0,
                "prioritized_studies": [],
                "message": (
                    f"Insufficient training data: {n_include} include, {n_exclude} exclude. "
                    f"Need at least {MIN_INCLUDE} include and {MIN_EXCLUDE} exclude decisions."
                ),
            }

        pending = _get_pending_studies(db, project_id)
        if not pending:
            return {
                "project_id": project_id,
                "model_trained": True,
                "n_training_samples": len(texts),
                "n_pending": 0,
                "prioritized_studies": [],
                "message": "No pending studies to prioritize.",
            }

        # Train TF-IDF + LogisticRegression
        vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            stop_words="english",
            sublinear_tf=True,
        )
        X_train = vectorizer.fit_transform(texts)
        y_train = np.array(labels)

        classifier = LogisticRegression(
            C=1.0,
            solver="liblinear",
            class_weight="balanced",
            random_state=42,
        )
        classifier.fit(X_train, y_train)

        # Predict on pending studies
        pending_texts = [
            (s.get("title") or "") + " " + (s.get("abstract") or "")
            for s in pending
        ]
        X_pending = vectorizer.transform(pending_texts)
        probabilities = classifier.predict_proba(X_pending)

        # Get include probability (class 1)
        include_probs = probabilities[:, 1] if classifier.classes_[1] == 1 else probabilities[:, 0]

        # Sort by include probability descending
        scored = []
        for i, s in enumerate(pending):
            prob = float(include_probs[i])
            uncertainty = round(1.0 - abs(prob - 0.5) * 2.0, 4)  # 1.0 = maximum uncertainty (prob=0.5)
            scored.append({
                "study_id": s["study_id"],
                "title": s.get("title", ""),
                "authors": s.get("authors", ""),
                "publication_year": s.get("publication_year"),
                "journal": s.get("journal", ""),
                "ai_priority_score": round(prob, 4),
                "uncertainty_score": uncertainty,
            })

        scored.sort(key=lambda x: x["ai_priority_score"], reverse=True)

        # Update ai_priority_score in DB
        for s in scored:
            db.update("studies", s["study_id"], {"ai_priority_score": s["ai_priority_score"]})
        db.commit()

        return {
            "project_id": project_id,
            "model_trained": True,
            "n_training_samples": len(texts),
            "n_pending": len(pending),
            "prioritized_studies": scored,
            "message": f"Prioritized {len(pending)} pending studies using TF-IDF + LogReg ({len(texts)} training samples with active learning uncertainty scoring).",
        }
    except Exception as e:
        return {
            "project_id": project_id,
            "model_trained": False,
            "n_training_samples": 0,
            "n_pending": 0,
            "prioritized_studies": [],
            "message": f"AI prioritization failed: {str(e)}",
        }


def submit_active_learning_feedback(project_id: str, study_id: str, corrected_decision: str, reviewer_id: str = "", db: Optional[DBBackend] = None) -> dict:
    """Submit a reviewer correction for a misprioritized study and re-prioritize pending studies.

    Args:
        project_id: Project identifier
        study_id: Corrected study ID
        corrected_decision: 'included' or 'excluded'
        reviewer_id: Reviewer ID submitting feedback

    Returns:
        Dict with status and updated prioritization results
    """
    db = db or get_db_backend()
    norm_dec = corrected_decision.strip().lower()
    if norm_dec not in ("included", "excluded", "maybe"):
        raise ValueError(f"Invalid corrected_decision '{corrected_decision}'. Must be 'included', 'excluded', or 'maybe'.")

    study = db.get("studies", study_id)
    if not study:
        raise ValueError(f"Study '{study_id}' not found.")
    if study.get("project_id") != project_id:
        raise ValueError(f"Study '{study_id}' does not belong to project '{project_id}'.")

    stage = study.get("screening_stage") or "ta"
    dec_id = str(uuid.uuid4())
    now_str = datetime.now(timezone.utc).isoformat()
    rev_id = reviewer_id or "reviewer"

    # Insert decision record for audit trail
    db.insert("screening_decisions", {
        "decision_id": dec_id,
        "study_id": study_id,
        "project_id": project_id,
        "reviewer_id": rev_id,
        "reviewer_name": "Active Learning Reviewer",
        "decision": norm_dec,
        "reason_code": "active_learning_correction",
        "reason_text": "Reviewer active learning feedback correction",
        "stage": stage,
        "is_blinded": 0,
        "created_at": now_str,
    })

    db.update("studies", study_id, {
        "screening_status": norm_dec,
        "screening_stage": stage,
        "screening_reason": "Active learning correction",
    })
    db.commit()

    # Trigger re-prioritization
    return prioritize_studies(project_id, db=db)
