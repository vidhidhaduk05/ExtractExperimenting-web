"""Python implementation of Laya System-1 local inference engine using ONNX Runtime.

Compatible with the Jev / TypeSafe System One question schema:
- state: string or json object
- questions: dict of question definitions (choice, score, noul)

Runs fully locally without any external API calls.
"""
from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

QTYPES = {"choice": 0, "score": 1, "noul": 2}
QTYPE_NAMES = ["choice", "score", "noul"]


def _py_json_dumps(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))


def _serialize_state(state: Any) -> str:
    return state if isinstance(state, str) else _py_json_dumps(state)


def _to_internal(q: Dict[str, Any]) -> Dict[str, Any]:
    t = q.get("type", "choice")
    crit = q.get("criteria")
    if t == "choice" and isinstance(crit, list):
        crit = {c: None for c in crit}
    ins = q.get("instructions", "")
    ins_str = ins if isinstance(ins, str) else json.dumps(ins)
    return {"t": t, "ins": ins_str, "crit": crit}


def _render_options(q: Dict[str, Any]) -> List[str]:
    t = q["t"]
    crit = q.get("crit")
    if t == "choice":
        crit_dict = crit or {}
        return [f"{k}: {v}" if v else k for k, v in crit_dict.items()]
    if t == "score":
        crit_list = crit or []
        return [f"level {i}: {c}" for i, c in enumerate(crit_list)]
    c = crit or {}
    f_text = c.get("false", "no, the statement does not hold")
    t_text = c.get("true", "yes, the statement holds")
    return [f"false: {f_text}", f"true: {t_text}"]


def _size_bucket(k: int) -> str:
    if k <= 2:
        return "2"
    if k <= 5:
        return "3-5"
    if k <= 10:
        return "6-10"
    return "11+"


def _temp_bucket(qtype: int, k: int) -> str:
    return f"{QTYPE_NAMES[qtype]}:{_size_bucket(k)}"


def _softmax(z: np.ndarray) -> np.ndarray:
    z_max = np.max(z)
    e = np.exp(z - z_max)
    return e / np.sum(e)


def _confidence_from_probs(p: np.ndarray) -> float:
    k = len(p)
    if k < 2:
        return 1.0
    ent = -np.sum(p * np.log(np.maximum(p, 1e-12)))
    return float(1.0 - ent / math.log(k))


class LayaModel:
    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        with open(os.path.join(model_dir, "laya_config.json"), "r", encoding="utf-8") as f:
            self.config = json.load(f)

        tokenizer_path = os.path.join(model_dir, "tokenizer", "tokenizer.json")
        self.tokenizer = Tokenizer.from_file(tokenizer_path)

        self.cls_id = self.tokenizer.token_to_id("[CLS]")
        self.sep_id = self.tokenizer.token_to_id("[SEP]")
        self.mask_id = self.tokenizer.token_to_id("[MASK]")
        self.pad_id = self.tokenizer.token_to_id("[PAD]")
        self.mask_tok = "[MASK]"

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        threads = int(os.environ.get("LAYA_NUM_THREADS", "0")) or min(8, os.cpu_count() or 4)
        opts.intra_op_num_threads = threads
        opts.inter_op_num_threads = 2

        available = ort.get_available_providers()
        preferred = []
        if "CUDAExecutionProvider" in available and os.environ.get("LAYA_DEVICE", "cuda").lower() != "cpu":
            preferred.append("CUDAExecutionProvider")
        preferred.append("CPUExecutionProvider")

        model_onnx_path = os.path.join(model_dir, "laya.onnx")
        self.session = ort.InferenceSession(model_onnx_path, sess_options=opts, providers=preferred)

    def _encode(self, text: str) -> List[int]:
        return self.tokenizer.encode(text, add_special_tokens=False).ids

    def _build_sequence(self, state: Any, q: Dict[str, Any]) -> Tuple[List[int], List[int]]:
        def scrub(s: str) -> str:
            return s.replace(self.mask_tok, " ")

        opts = _render_options(q)
        head_ids = self._encode(f"{q['t']} question: {scrub(q['ins'])}")
        opt_ids = [[self.mask_id] + self._encode(" " + scrub(o))[:48] for o in opts]

        def total_len(xs: List[List[int]]) -> int:
            return sum(len(x) for x in xs)

        head_max_len = self.config.get("head_max_len", 192)
        max_len = self.config.get("max_len", 512)

        opt_budget = head_max_len - total_len(opt_ids)
        if opt_budget < 16:
            per = max(4, math.floor((head_max_len - 16) / max(1, len(opt_ids))))
            opt_ids = [o[:per] for o in opt_ids]
            opt_budget = head_max_len - total_len(opt_ids)

        head_ids = head_ids[: max(8, opt_budget)]
        seq = [self.cls_id] + head_ids + [self.sep_id]
        markers = []
        for o in opt_ids:
            markers.append(len(seq))
            seq.extend(o)
        seq.append(self.sep_id)

        room = max(0, max_len - len(seq) - 1)
        st_tokens = self._encode(scrub(_serialize_state(state)))[:room]
        seq.extend(st_tokens)
        seq.append(self.sep_id)

        return seq[:max_len], [m for m in markers if m < max_len]

    def system_one_batch(
        self, requests: List[Tuple[str, Any, Dict[str, Dict[str, Any]]]]
    ) -> Dict[str, Dict[str, Any]]:
        """Batched System One inference across multiple studies/states and questions in a single ONNX forward pass.

        Args:
            requests: List of tuples (study_id, state, questions_dict)

        Returns:
            Dict mapping study_id -> {qid: answer_dict}
        """
        if not requests:
            return {}

        items = []
        for study_id, state, questions in requests:
            for qid, q_def in questions.items():
                q = _to_internal(q_def)
                seq, markers = self._build_sequence(state, q)
                opts_count = len(_render_options(q))
                if len(markers) != opts_count:
                    continue
                items.append({
                    "study_id": study_id,
                    "qid": qid,
                    "q": q,
                    "ids": seq,
                    "markers": markers,
                    "qtype": QTYPES[q["t"]],
                })

        if not items:
            return {r[0]: {} for r in requests}

        n = len(items)
        L = max(len(it["ids"]) for it in items)
        K = max(len(it["markers"]) for it in items)

        input_ids = np.full((n, L), self.pad_id, dtype=np.int64)
        attention_mask = np.zeros((n, L), dtype=np.int64)
        marker_pos = np.zeros((n, K), dtype=np.int64)
        marker_mask = np.zeros((n, K), dtype=bool)
        qtype = np.zeros(n, dtype=np.int64)

        for i, it in enumerate(items):
            cur_ids = it["ids"]
            input_ids[i, : len(cur_ids)] = cur_ids
            attention_mask[i, : len(cur_ids)] = 1
            cur_markers = it["markers"]
            marker_pos[i, : len(cur_markers)] = cur_markers
            marker_mask[i, : len(cur_markers)] = True
            qtype[i] = it["qtype"]

        outputs = self.session.run(
            ["logits", "act_probs"],
            {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "marker_pos": marker_pos,
                "marker_mask": marker_mask,
                "qtype": qtype,
            },
        )
        logits = outputs[0]  # shape: [n, K]
        act_probs = outputs[1]  # shape: [n, 2]

        temps_by_opt = self.config.get("temperature_by_options", {})
        default_temps = self.config.get("temperature", [1.0, 1.0, 1.0])

        results: Dict[str, Dict[str, Any]] = {r[0]: {} for r in requests}

        for r, it in enumerate(items):
            study_id = it["study_id"]
            qid = it["qid"]
            k = len(it["markers"])
            t_key = _temp_bucket(it["qtype"], k)
            temp = temps_by_opt.get(t_key, default_temps[it["qtype"]] if it["qtype"] < len(default_temps) else 1.0)

            unscaled_logits = logits[r, :k]
            scaled = unscaled_logits / temp
            p = _softmax(scaled)

            ext = {"act_probability": float(round(act_probs[r, 0], 4))}
            q = it["q"]

            if q["t"] == "choice":
                keys = list(q.get("crit", {}).keys())
                best_idx = int(np.argmax(p))
                results[study_id][qid] = {
                    "type": "choice",
                    "choice": keys[best_idx],
                    "probabilities": {k_name: round(float(p[idx]), 4) for idx, k_name in enumerate(keys)},
                    "confidence": round(_confidence_from_probs(p), 4),
                    "rl_agent": ext,
                }
            elif q["t"] == "score":
                crit_list = q.get("crit", [])
                score_val = sum(i * float(p[i]) for i in range(len(p)))
                results[study_id][qid] = {
                    "type": "score",
                    "score": round(score_val, 4),
                    "legend": {str(i): c for i, c in enumerate(crit_list)},
                    "probabilities": {str(i): round(float(p[i]), 4) for i in range(len(p))},
                    "confidence": round(_confidence_from_probs(p), 4),
                    "rl_agent": ext,
                }
            else:  # noul
                results[study_id][qid] = {
                    "type": "noul",
                    "noul": round(float(p[1]), 4),
                    "rl_agent": ext,
                }

        return results

    def system_one(self, state: Any, questions: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Single-item System One inference (calls system_one_batch for execution)."""
        if not questions:
            raise ValueError("system_one requires at least one question")
        batch_res = self.system_one_batch([("single_item", state, questions)])
        return batch_res.get("single_item", {})
