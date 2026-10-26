import subprocess

branches = [
    "origin/bolt-dedup-title-length-bound-opt-3833269626073391496",
    "origin/bolt-dedup-union-find-opt-16410366408604326434",
    "origin/bolt-opt-reference-parser-pico-900929500991830103",
    "origin/bolt-optimize-citation-verification-698488993472397978",
    "origin/bolt-optimize-dedup-service-9039125039465752516",
    "origin/bolt-pico-header-extraction-perf-7998611192518268241",
    "origin/bolt-precompile-ref-parser-regexes-6475624018361337619",
    "origin/bolt-signal-prefilter-opt-3142384947292218875",
    "origin/bolt/dedup-author-normalization-cache-6260932922367542563",
    "origin/bolt/dedup-service-length-prefilter-2063406775545597750",
    "origin/bolt/optimize-dedup-study-pairing-4420602082700418684",
    "origin/bolt/optimize-dedup-title-similarity-8920280900788033945",
    "origin/bolt/pico-dedup-perf-383395102026499563",
    "origin/bolt/search-string-matcher-opt-14621010664083461772",
    "origin/jules-3729280950034237775-5c4a758b",
    "origin/perf/dedup-length-pruning-16685143230910909426",
]

for b in branches:
    print(f"\n--- Trying to merge {b} ---")
    res = subprocess.run(["git", "merge", "--no-edit", b], capture_output=True, text=True, errors="replace")
    if res.returncode == 0:
        print(f"SUCCESS: {b} merged cleanly.")
    else:
        print(f"CONFLICT/ERROR in {b}:\n{res.stdout}\n{res.stderr}")
        status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, errors="replace")
        print("Conflicted files:\n" + status.stdout)
        break
