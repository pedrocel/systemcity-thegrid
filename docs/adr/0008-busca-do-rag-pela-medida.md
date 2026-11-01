# 0008. Code search chosen by measurement: vectors over hybrid

**Status:** accepted

## Context

"Ask the code" answers questions about a repository with citations. Hybrid search (vectors + BM25, merged with Reciprocal Rank Fusion) is the usual default, so that was the plan.

## Measurement

`servidor/avaliacao/avaliar.mjs` runs 35 questions, in English and Portuguese, written before any result was seen, against this repository (93 files, 412 chunks). A hit means retrieving one of the expected files. Embeddings: multilingual-e5-small, quantized, on CPU.

| Mode | recall@1 | recall@3 | recall@5 | recall@8 | MRR |
|---|---|---|---|---|---|
| BM25 | 0.400 | 0.600 | 0.657 | 0.686 | 0.508 |
| Vectors | 0.514 | 0.771 | 0.800 | 0.829 | 0.642 |
| Hybrid (RRF) | 0.429 | 0.657 | 0.714 | 0.714 | 0.545 |

Hybrid lost. The code is written in Portuguese, so English questions rarely share words with it; BM25 adds noise that drags down what the vectors found.

## Decision

Vectors are the default. BM25 is the fallback when the model is off. No reranker was added, since nothing has shown it is needed.

## Cost

- 35 questions on one repository is a small set: it supports this choice here, not a general claim about hybrid search.
- The model peaked near 900 MB of memory and took about 0.8 s per chunk on a laptop, so vectors are opt-in (`RAG_VETORES=1`) and indexing is one job at a time, reusing the vectors of unchanged chunks.
