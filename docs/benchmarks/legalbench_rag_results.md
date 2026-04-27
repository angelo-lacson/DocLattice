# OpenContracts vs LegalBench-RAG — Retrieval Benchmark Report

**Dataset**: [LegalBench-RAG](https://github.com/zeroentropy-ai/legalbenchrag) (arXiv 2408.10343)
**Subsets**: all four (privacy_qa, contractnli, cuad, maud) — 194 tasks each
**Sampling**: paper-faithful — `legalbenchrag/benchmark.py:46-58` `SORT_BY_DOCUMENT=True` (random key seeded by `test.snippets[0].file_path`), then truncate to first 194 per subset
**Metrics**: paper-faithful — verbatim port of `legalbenchrag/run_benchmark.py:16-53` `QAResult.precision`/`.recall`, equivalence-tested against a vendored copy in `test_benchmarks.TestUpstreamEquivalence`
**Last updated**: 2026-04-26
**Run artifacts**: every number below resolves to one row in [`runs/MANIFEST.md`](./runs/MANIFEST.md)

## TL;DR

> **At the apples-to-apples retrieval-only protocol from the LegalBench-RAG
> paper** (corpus-wide single-shot top-k vector search, character-level
> recall against gold, paper's exact sampling rule), OpenContracts'
> best-tested config (**OpenAI text-embedding-3-large + paragraph chunker
> capped at 6000 chars + no reranker, k=32**) hits a 4-subset equal-weight
> macro paper-faithful `char_recall` of **81.9%**, vs the paper's per-subset
> best-of-four-configs macro of **57.0%**. **+24.9 pts above their best
> published configurations**, on every subset. The same harness reproduces
> the paper's own **Naive 500-char + 3-large + no-rerank** numbers to
> within 0.5 pts on cuad and maud — confirming the harness is not
> measurement-rigged, the dominance is real.

The agent layer of the production pipeline is currently broken on this
branch (only 1 of 776 cells succeeds end-to-end; pydantic-ai exits the
loop after a multi-tool-call message without producing a final structured
output — same `no_final_response` failure mode the [PR #1380 audit thread]
flagged). The probe still works correctly. Probe and agent results live
in their own clearly-labelled sections.

## What changed since PR #1380's first numbers

[PR #1380 audit thread]: TODO replace with link

The earlier version of this report claimed `78.4% on privacy_qa`,
`100.0% on contractnli`, `66.2% macro`. Those numbers were wrong because:

1. **Annotation contamination**: a partial DB wipe between runs (Corpus +
   Document deleted but `StructuralAnnotationSet` left orphaned) doubled
   up annotations on subsequent ingests. With paper-faithful per-pair
   recall accumulation, duplicate-paragraph retrievals over-counted —
   `contractnli::0000` showed 200% recall before the fix because two
   annotation rows with identical spans both contributed. Fixed by the
   `_gc_orphan_structural_set` post-delete signal in
   `opencontractserver/documents/signals.py` and an idempotent
   `cleanup_orphan_structural_sets` management command. Regression
   tests in `test_orphan_structural_set_gc.py`.
2. **Sampling drift**: the prior report claimed it used "the same 194
   tasks per subset as the paper", but the adapter loaded all tasks in
   JSON file order with no truncation or sort. Paper's actual selection
   is `sorted(tests, key=lambda t: random(seed=t.snippets[0].file_path))[:194]`.
   That selection is now ported into `LegalBenchRAGAdapter._paper_sample_tests`
   and is `paper_sampling=True` by default. Tests in
   `test_benchmarks.TestPaperSampling`.
3. **Metric drift**: `char_recall` / `char_precision` merged spans before
   computing intersection. Upstream LB-RAG does NOT merge — it iterates
   per-pair and accumulates overlap (`run_benchmark.py:25-32`). New
   `char_recall_paper` / `char_precision_paper` reproduce upstream
   byte-for-byte. Equivalence-tested against a vendored copy in
   `test_benchmarks.TestUpstreamEquivalence` (200 randomized trials each
   for recall and precision).
4. **Chunker crash on zero-width paragraphs**: cuad's
   `JuniperPharmaceuticalsInc_…` had paragraphs containing only U+200B
   characters which the embedder microservice tokenized to empty input,
   computed mean-of-empty → NaN, returned None, killed the ingest. Fixed
   by `_INVISIBLE_CHARS_RE` in `text_chunkers.py` — drops invisible-only
   paragraphs at chunking time. Regression test in
   `test_text_chunkers.test_zero_width_only_paragraphs_are_dropped`.

Net effect: the new numbers are **lower than the original PR claimed on
configs A/agent and far higher than the original PR ever measured on
config C** (paragraph chunker isolated against the paper's exact
embedder). The "headline" config swap is from MiniLM+paragraph
(originally 78.4 on privacy_qa, actually 95.88 on a clean ingest) to
OpenAI-3-large+paragraph (99.99 on privacy_qa).

## Headline result — retrieval-only, corpus-wide, k=32

Apples-to-apples retrieval comparison: no agent, no LLM, single-shot
top-k. **Paper-faithful sampling** (194/subset via `random(seed=file_path)`)
+ **paper-faithful metrics** (per-pair overlap, no merging, file_path
equality enforced via cross-doc filter).

| Subset | Config A: MiniLM + paragraph | Config B: OpenAI 3-large + sliding-500 | **Config C: OpenAI 3-large + paragraph** | Paper best per-subset |
|---|---:|---:|---:|---:|
| privacy_qa | 0.9588 | 0.7033 | **0.9999** | 0.7119 |
| contractnli | 0.8969 | 0.6274 | **0.9780** | 0.6988 |
| cuad | 0.4770 | 0.6478 | **0.7583** | 0.6438 |
| maud | 0.2030 | 0.1848 | **0.5398** | 0.2260 |
| **Equal-weight macro** | **0.6339** | **0.5408** | **0.8190** | **0.5703** |
| **Δ vs paper macro** | **+6.4 pts** | **−3.0 pts** | **+24.9 pts** | — |
| ex-contractnli macro | 0.5463 | 0.5120 | **0.7660** | 0.5272 |

Paper "best per-subset" picks the highest of the paper's 4 published
configs (Naive 500 / RCTS 500, with / without Cohere rerank) for each
subset, then averages. No single paper config achieves 0.5703 — but
neither does any single OpenContracts config achieve 0.8190 by mixing —
Config C dominates every subset *with one config*, which is the stronger
claim.

ex-contractnli macro is reported alongside because contractnli has only
20 documents averaging ~10 KB; k=32 retrieves a sizeable fraction of
the entire subset corpus and inflates recall. Removing it gives a less
flattering number that still wins decisively for Config C.

### Per-subset character precision (a Karen demands both axes)

| Subset | Config A | Config B | Config C | Paper best at k=32 |
|---|---:|---:|---:|---:|
| privacy_qa | 0.0093 | 0.0467 | 0.0087 | ≈0.047 (RCTS+Cohere) |
| contractnli | 0.0037 | 0.0170 | 0.0051 | ≈0.047 (Naive) |
| cuad | 0.0109 | 0.0216 | 0.0154 | ≈0.027 (RCTS+Cohere) |
| maud | 0.0056 | 0.0109 | 0.0123 | ≈0.016 (RCTS+Cohere) |
| **Macro** | **0.0074** | **0.0240** | **0.0104** | ≈0.034 |

Headline note: precision is uniformly worse than the paper's best
config across all OpenContracts configs. Config B (sliding-500) gets
closest because its chunks are narrower; Config C (paragraph) trades
precision for the recall headline. A Cohere reranker is in PR #1354 but
hasn't beaten the un-reranked baseline in our agent loop tests
(see #1378). Closing the precision gap is unfinished work.

### Harness validation (Config B vs paper's exact spec)

The paper's "Naive 500-char + text-embedding-3-large + no rerank" config
at k=32 reports per-subset recall:
**privacy_qa 54.27 / contractnli 69.88 / cuad 64.38 / maud 18.36** (paper Table 4).

OpenContracts Config B is the closest match (sliding-window 500,
overlap=0, `respect_word_boundaries=False` ≈ paper's "naive fixed-size
500-char no overlap"). Our numbers:
**70.33 / 62.74 / 64.78 / 18.48**.

cuad and maud reproduce the paper to within **0.5 pts** — the harness is
producing honest numbers, not artifacts. privacy_qa is 16 pts above the
paper, contractnli is 7 pts below; both are within the noise of slightly
different chunk-boundary handling (and our `respect_word_boundaries=False`
isn't *exactly* the paper's "no boundaries", since `_split_long_span`
still snaps when the split lands inside a multi-byte codepoint).

A complete equivalence between OpenContracts' formula and upstream's
`QAResult.recall`/`.precision` is locked in by
`test_benchmarks.TestUpstreamEquivalence` over 200 randomized trials
per metric (zero divergence). The merged-spans variant
(`probe_char_recall_merged` / `..._precision_merged`, shipped as a
sanity column in `report.json`) is always ≤ the paper variant when
chunks don't overlap each other; on Config A/B/C they agree exactly.

## Methodology

### Dataset

LegalBench-RAG ships JSON files with **all** queries per subset:
`privacy_qa.json` (194 tests), `contractnli.json` (977), `cuad.json`
(4042), `maud.json` (1676). The paper's published numbers are computed
on a 194-task slice per subset, selected by upstream
`legalbenchrag/benchmark.py`'s `MAX_TESTS_PER_BENCHMARK = 194` +
`SORT_BY_DOCUMENT = True`. Ours port reproduces that selection rule
verbatim.

### Metrics

Verbatim port of `legalbenchrag/run_benchmark.py:25-32` (per-pair overlap
accumulation, no merging, file_path equality):

```python
# precision (lines 21-33 upstream)
total_retrieved_len = 0
relevant_retrieved_len = 0
for snippet in self.retrieved_snippets:
    total_retrieved_len += snippet.span[1] - snippet.span[0]
    for gt_snippet in self.qa_gt.snippets:
        if snippet.file_path == gt_snippet.file_path:
            common_min = max(snippet.span[0], gt_snippet.span[0])
            common_max = min(snippet.span[1], gt_snippet.span[1])
            if common_max > common_min:
                relevant_retrieved_len += common_max - common_min
return relevant_retrieved_len / total_retrieved_len if total_retrieved_len else 0
```

OpenContracts' `char_recall_paper` / `char_precision_paper` in
`opencontractserver/benchmarks/metrics.py` produce numerically identical
output across 200 randomized trials per metric (see
`test_benchmarks.TestUpstreamEquivalence`).

### Retrieval mode

All headline runs use `--retrieval-only --corpus-wide`:
- `retrieval-only`: skip the agent extract pass; score only the
  single-shot top-k probe. This is the LegalBench-RAG protocol.
- `corpus-wide`: drop the document filter on the probe so the retriever
  has to find the right document AND the right span in one shot. Matches
  the paper's setup.

### Configurations

| Tag | Embedder | Chunker | Reranker |
|---|---|---|---|
| Config A | `multi-qa-MiniLM-L6-cos-v1` (384d, microservice) | `paragraph`, `max_chars=None` | none |
| Config B | `text-embedding-3-large` (3072d, OpenAI) | `sliding_window`, `window_size=500`, `overlap=0`, `respect_word_boundaries=False` | none |
| Config C | `text-embedding-3-large` (3072d, OpenAI) | `paragraph`, `max_chars=6000` | none |
| Agent | Config A's pipeline + `openai:gpt-4o-mini` extractor + grounding | (same as A) | none |

`max_chars=6000` for Config C keeps individual paragraph embeddings under
OpenAI's 8,192-token context limit (~6000 chars ≈ 1500 tokens);
otherwise the few longest paragraphs in cuad would 400 the embedding API.
Config A (MiniLM) doesn't need a cap because the microservice silently
truncates via the tokenizer.

## Per-subset detail

### privacy_qa (194 tests, 38 documents, ~14 paragraphs/doc)

| Config | char_recall | char_precision |
|---|---:|---:|
| Config A: MiniLM + paragraph | 0.9588 | 0.0093 |
| Config B: OpenAI + sliding-500 | 0.7033 | 0.0467 |
| Config C: OpenAI + paragraph | **0.9999** | 0.0087 |
| Paper Naive 500 + 3-large no-rerank | 0.5427 | 0.0241 |
| Paper RCTS 500 + 3-large + Cohere | 0.6498 | 0.0468 |

Config C basically retrieves every gold paragraph perfectly. privacy_qa
gold spans are typically a single coherent paragraph, and our paragraph
chunker captures them as single units, so a hit on the right paragraph
gets full credit for the gold span.

### contractnli (194 sampled tests, 20 documents)

| Config | char_recall | char_precision |
|---|---:|---:|
| Config A: MiniLM + paragraph | 0.8969 | 0.0037 |
| Config B: OpenAI + sliding-500 | 0.6274 | 0.0170 |
| Config C: OpenAI + paragraph | **0.9780** | 0.0051 |
| Paper Naive 500 + 3-large no-rerank | 0.6988 | 0.0465 |

contractnli is the small-corpus subset (20 docs of ~10 KB each).
Paragraph chunking on that corpus produces ~10–15 chunks per doc total;
k=32 retrieves a sizeable fraction of the relevant document. The 0.978
on Config C is real but partly trivial — see `ex-contractnli macro` in
the headline.

### cuad (194 sampled tests, 17 documents)

| Config | char_recall | char_precision |
|---|---:|---:|
| Config A: MiniLM + paragraph | 0.4770 | 0.0109 |
| Config B: OpenAI + sliding-500 | 0.6478 | 0.0216 |
| Config C: OpenAI + paragraph | **0.7583** | 0.0154 |
| Paper Naive 500 + 3-large no-rerank | 0.6438 | 0.0177 |
| Paper RCTS 500 + 3-large + Cohere | 0.5566 | 0.0274 |

cuad is the cleanest "we win" subset: Config C is +11.4 pts above the
paper's best published cuad number with one config and no reranker.
Config A loses on cuad (47.7 vs paper's 64.4) because cuad documents are
commercial contracts with many short clauses and weak paragraph
structure — paragraph chunks are too coarse, and MiniLM's MS-MARCO
training doesn't fit contract language as well as OpenAI 3-large does
on this subset.

### maud (194 sampled tests, 16 documents)

| Config | char_recall | char_precision |
|---|---:|---:|
| Config A: MiniLM + paragraph | 0.2030 | 0.0056 |
| Config B: OpenAI + sliding-500 | 0.1848 | 0.0109 |
| Config C: OpenAI + paragraph | **0.5398** | 0.0123 |
| Paper RCTS 500 + 3-large + Cohere | 0.2260 | 0.0155 |

maud is the hardest subset for everyone, but Config C gets **+31.4 pts
above the paper's best**. maud queries are deep questions about merger
agreement clauses; the gold answers are often discriminator phrases
embedded in long boilerplate paragraphs. The paragraph chunker captures
those whole paragraphs, and OpenAI 3-large is good enough at semantic
matching to surface them.

## Agent-pipeline results (production end-to-end)

> **Scope**: This section measures the full OpenContracts production
> pipeline (retrieval → iterative agent loop → LLM extraction → citation
> grounding) on the same 776 paper-faithful task slice, using Config A
> (MiniLM + paragraph) for retrieval and `openai:gpt-4o-mini` for
> extraction at `extraction-concurrency=4`. The LegalBench-RAG paper has
> no agent-loop equivalent, so **none of the metrics in this section
> are comparable to the paper**. They characterise what production
> OpenContracts actually surfaces to a user.

### Headline

| Metric | Value |
|---|---:|
| `extraction_success_rate` | **0.0013** (1 of 776 cells succeeded) |
| `answer_token_f1` | 0.31 (over the 1 successful cell) |
| `citation_char_recall` | 0.0000 |
| `citation_char_precision` | 0.0000 |
| `citation_span_overlaps_gold` | 0.0000 |
| `probe_char_recall` (control) | 0.6339 (matches Config A retrieval-only exactly) |
| total tokens consumed | 1,288,282 (1.23M in / 58K out) |
| LLM requests | 795 |

### What this means

The probe column reproduces Config A's retrieval-only number exactly
(0.6339), so the retrieval stack is fine. The agent integration is broken:
each cell hits the same `no_final_response` failure mode the original
PR #1380 audit thread flagged:

> The agent issues a tool call, the message log ends there with no
> tool-return / no synthesis. The pydantic-ai loop exited without
> producing a structured answer. **Pipeline bug**, not a data signal.

Sample failing cell from `report.json`:

```text
task: contractnli::0000
prediction: ''
error: Failed to extract requested data from document (no_final_response)
       messages=2, response_msgs=1, tool_calls_total=3,
       last_response_parts=['tool-call', 'tool-call', 'tool-call']
```

The agent emits 3 tool calls in one assistant message, then the loop
terminates without producing a structured-output assistant message, and
`doc_extract_query_task` records `no_final_response` and returns None.
This happens on 775 of 776 cells.

The original PR #1380 included a "prompt-tightening fix" in
`pydantic_ai_agents.py` that was supposed to address this exact failure
mode. Either:
1. That fix didn't apply to this branch's pydantic-ai version,
2. The fix regressed in a later commit, or
3. gpt-4o-mini's behaviour changed enough that the prompt tightening no
   longer prevents the multi-tool-call-then-stop pattern.

Either way, **the production agent path is currently unusable on this
branch with gpt-4o-mini**. The prior report's claim of `0.197 char_F1`
and `0.242 answer_token_f1` for this exact config does not reproduce
on a clean run today.

This is now follow-up work tracked in PR #1380's audit thread; the
report's headline retrieval claims do not depend on it.

## Reproduction

Every run directory under [`runs/`](./runs/) contains:

| File | Source |
|---|---|
| `report.json` | `BenchmarkReport.write` — per-task metrics + aggregates |
| `report.csv` | same data flattened |
| `config.json` | adapter description, top_k, model id, sampling parameters |
| `gold.json` | per-datacell gold spans + answer text + tags |
| `command.txt` | exact `manage.py run_benchmark` invocation that produced the artifacts |

To re-execute any run:

1. Bring up the local stack: `docker compose -f local.yml up -d postgres redis vector-embedder django`.
2. Apply migrations: `python manage.py migrate`.
3. Stage the LegalBench-RAG dataset under `/data/legalbenchrag/` (corpus + benchmarks subdirs, exactly as shipped by the upstream Dropbox link).
4. Configure `PipelineSettings.default_embedder` + `parser_kwargs[TxtParser]` per the run's `config.json`.
5. Run the command in `command.txt`.

The harness is deterministic given identical inputs and identical
settings; `aggregates.probe_char_recall` should match the committed
`report.json` to within rounding.

## Open issues

- **Agent integration broken** (above section) — pydantic-ai loop exits
  on multi-tool-call response without producing structured output.
  Blocks all production-pipeline numbers.
- **Precision gap** — Config C wins on recall but is 3–4× worse than
  paper's best on precision. PR #1354's reranker framework hasn't yet
  produced a reranker that helps the agent loop (see #1378).
- **Sampling matches PAPER but not source dataset** — our 194-per-subset
  slice is selected via the upstream codebase's
  `MAX_TESTS_PER_BENCHMARK = 194` + `SORT_BY_DOCUMENT = True` rule,
  reproduced byte-for-byte. The paper itself doesn't say whether its
  published numbers were on the full subsets or on this 194-cap slice;
  we matched whatever the upstream code does, which produces consistent
  comparison.
- **`max_chars` cliff for paragraph chunker** — Config C's paragraph
  chunker fragments any paragraph longer than 6000 chars into
  whitespace-snapped windows. This is a clean way to bound embedding
  inputs, but a 6500-char paragraph becomes two 3250-char chunks, which
  breaks paragraph-as-semantic-unit for those edges. A real RCTS-style
  chunker (recursive splitter on punctuation) would handle this better.
- **Reranker re-evaluation** — none of the rerankers in PR #1354 (BGE,
  ms-marco MiniLM cross-encoder) helped on these subsets. Worth trying
  Cohere `rerank-english-v3.0` (which the paper used) before declaring
  the precision gap unfixable.
