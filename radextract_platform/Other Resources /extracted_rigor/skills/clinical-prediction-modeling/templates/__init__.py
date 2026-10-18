"""Clinical prediction modeling templates.

Modules:
    decision_trace — structured JSON audit log of statistical decisions
    imputation     — PMM-based MICE + Rubin's rules
    splines        — restricted cubic spline basis (Harrell)
    validation     — full-pipeline bootstrap, OOB evaluation, nested CV
    metrics        — AUC/CIs, paired differences, calibration, Brier, DCA
    binary         — logistic pipeline with splines + MI + standardization
    survival       — Cox pipeline with PH diagnostics
    continuous     — linear/ANCOVA/mixed pipelines
    ml_benchmark   — boosting/RF vs penalized regression, fair protocol
    tripod_check   — TRIPOD+AI checklist coverage from a decision trace
"""

from .decision_trace import DecisionTrace
from .imputation import MiceImputer, rubins_rules
from .splines import rcs_design, likelihood_ratio_test
from .validation import bootstrap_validate, nested_cv
from .metrics import (auc_with_ci, paired_auc_difference, calibration,
                      brier_score, decision_curve, oob_r_squared)
from .binary import BinaryPipeline, fit_binary_pipeline
from .survival import CoxPipeline, fit_cox_pipeline
from .continuous import LinearPipeline, fit_linear_pipeline
from .ml_benchmark import BoostingParams, ForestParams, benchmark

__all__ = [
    "DecisionTrace", "MiceImputer", "rubins_rules", "rcs_design",
    "likelihood_ratio_test", "bootstrap_validate", "nested_cv",
    "auc_with_ci", "paired_auc_difference", "calibration", "brier_score",
    "decision_curve", "oob_r_squared",
    "BinaryPipeline", "fit_binary_pipeline",
    "CoxPipeline", "fit_cox_pipeline",
    "LinearPipeline", "fit_linear_pipeline",
    "BoostingParams", "ForestParams", "benchmark",
]
