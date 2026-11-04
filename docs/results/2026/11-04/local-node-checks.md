# Forway local Node checks — 77 passed

4 November 2026. One invocation at source `14e7b44a6459602d1a5392eb313273d361db5fad` exited **0**: **77 passed, 0 failed/cancelled/skipped/TODO**. The [JSON receipt](local-node-checks.json) retains every actual TAP name/status, complete captured streams, original hashes, all source inputs and supervision evidence.

The exact [six-file scope](../../../proposals/focused-checks.md) ran with explicit TAP, serial file concurrency and a 10-second per-case limit. File counts were fetch-page 24, audit-api 12, content 8, observations 10, audit-facts 8 and workspace 15. Actual runtime was **Node 26.8.2 / Darwin arm64**, using the existing executable. This is a new observed profile within Node >=22, **not** reproduction of the historical 24.21.0 preparation. Its resolved executable was 50,288 bytes; streamed pre/post SHA-256 was `902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253`. Shared libraries were not inventoried.

TAP reported 767.987667 ms; the supervised child took 0.932307250 s. These are fixture timings, not a performance benchmark. The 120-second outer cap and 128 KiB per-stream caps were not reached. No termination signal, forced kill, truncation or rerun occurred. Stdout was 18,661 bytes, SHA-256 `5c5bc2361867d312b22940d8fa126024abc366506cc800e0d7d3341404d5240f`; stderr was empty.

**Collector qualification:** its original status was `failed` solely because an extra, unrequested check expected argv-file order. Node emitted all 77 exact unique names in a different order. The proposal requires the exact name/status set, not that order. The original collection object, false ordering check and raw stream hashes remain unchanged in the receipt; all mandated gates passed. No assertion or application source was changed to obtain this result.

Before/after guards matched **30 complete non-results inputs / 197,870 bytes**, all 34 tracked path/mode/blob identities, the original 24 non-Markdown inputs and all 4 historical result files. The runner was directly reaped and its original isolated process group was absent. Node-managed workers were not individually enumerated/waited; no inventory of descendants in separate sessions is claimed. The private marker/device/inode-checked temp root contained only expected empty directories and was removed.

No install, server, browser, default DNS/HTTP adapter, real account, provider/model, database or CI was invoked. Authored adapters do not establish real-network/API acceptance; no independent socket trace was collected. The eight browser scenarios, indexing/rankings, representative AI visibility, shared persistence and full-product acceptance remain open. Only this receipt pair changed.

## Later status-document edition

The subsequent publication edition changes only `AGENTS.md`, `README.md` and
`docs/proposals/focused-checks.md` among the 30 tested inputs. The other 27 remain
unchanged, including all 24 non-Markdown code/test/config/asset inputs. The raw
JSON and four historical result files/seals are unchanged. Reproduce pinned
`14e7b44a6459602d1a5392eb313273d361db5fad`; this status update is not a new run
and preserves the original collector qualification.
