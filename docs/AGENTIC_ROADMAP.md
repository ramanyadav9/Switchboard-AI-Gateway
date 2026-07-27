# Switchboard → OpenCode-level Agentic Coding Tool

A mechanism-level comparison of **OpenCode** (frontier-model coding agent), **little-coder**
(small-local-model coding agent), and **Switchboard** (our multi-model gateway), plus the
roadmap to close the gap.

> **Positioning.** Switchboard is a *multi-model gateway*, not a small-model tool. A user may run
> Qwen3-14B on a modest GPU, a 70B/120B on a big rig, or bring their own OpenAI-compatible endpoint.
> The design principle: **one agent loop + one tool set + one big agentic system prompt**, with a
> per-model **capability profile** that decides *how much correction the harness applies*. Frontier
> models flow through nearly untouched; small local models get the full little-coder safety net.
> This is the differentiator: OpenCode assumes frontier-only; we support the whole spectrum, self-hosted.

---

## The capability-profile spine (the backbone everything hangs off)

Every reliability mechanism becomes a per-model setting resolved from the model id (little-coder's
`benchmark-profiles` pattern + OpenCode's per-model prompt table `system.ts:27-42`):

```
model id → profile
  qwen3-14b    → { base_prompt: "default", parse_text_toolcalls: on,  json_repair: on,
                   edit_fuzz: high,   force_temp: 0.3, thinking_budget: 4096,
                   compact_at: 0.75, tail_inject: on,  write_guard: on, read_before_edit: on }
  llama-70b    → { base_prompt: "default", parse_text_toolcalls: on,  json_repair: on,
                   edit_fuzz: medium, compact_at: 0.80, write_guard: on, read_before_edit: on }
  gpt-oss-120b → { base_prompt: "beast",   parse_text_toolcalls: off, edit_fuzz: low,
                   compact_at: 0.85, write_guard: soft }
  <user BYO>   → sensible defaults, overridable in the UI
```

Resolution order (little-coder `normKey`): exact id → separator-insensitive prefix → `default`.
Store on the model registry entry; the UI lets users tune per model.

---

## Capability-by-capability comparison

### 1. System prompt / agentic behavior

**OpenCode** (`session/system.ts`, `session/prompt/*.txt`)
- **Per-model base prompt** chosen by string-match on model id: `anthropic.txt` (105 lines),
  `beast.txt` (147 lines, hyper-agentic for GPT/o-series), `gpt.txt`, `gemini.txt`, `default.txt` (95 lines).
- Structured markdown sections: identity → tone/style ("fewer than 4 lines", no preamble) →
  professional objectivity → **Task Management (use TodoWrite VERY frequently)** → Doing tasks
  (lint/typecheck after; never commit unless asked) → **Tool usage policy** (prefer Task subagent for
  search; parallelize independent calls; `Read` not `cat`, `Edit` not `sed`) → Code References (`file:line`).
- `beast.txt` literally says *"keep going until the query is completely resolved… NEVER end your turn…
  when you say you will make a tool call, ACTUALLY make it"* — this is what stops premature yielding.
- Assembled at runtime: `environment(cwd, OS, git status, date) + AGENTS.md + mcpInstructions + skills`.
  Base prompt injected separately in the LLM layer.

**little-coder** (`AGENTS.md` + per-turn injection)
- Static base `AGENTS.md`: anti-refusal ("DO NOT refuse by claiming you are 'just a chat interface'"),
  runtime invariants stated as facts ("**Write refuses on existing files. Use Edit.**"),
  anti-deliberation ("commit to an implementation once you have conviction; when your reasoning trace
  hits the cap, the extension forces you back to implementation — don't fight it").
- **Per-turn tail injection** (the key small-model trick, `_shared/inject.ts`): tool cards, algorithm
  cheat-sheets, and protocols are injected at the **conversation tail**, NOT the system prompt —
  because (a) changing the system prefix invalidates the llama.cpp KV cache (re-churns ~120k tokens/turn)
  and (b) small models weight the tail most. Dedupe suppresses re-sending identical blocks.
- **Protocols as injected rules** (`skills/protocols/`): `task_decomposition` ("reply GIVEN/UNKNOWN/PLAN
  before ANY tool action"), `cite_before_answer`, `research_protocol` (explicit stop condition).

**Switchboard today** (`context.py::_build_system_prompt`)
- One ~30-line static `GLOBAL_SYSTEM_PROMPT` + optional per-conversation prompt + a ~10-line
  `TOOL_SYSTEM_PROMPT`. **No per-model prompt, no environment block (cwd/OS/git), no planning/verification
  policy, no todo discipline.** The agent path adds almost nothing over the chat path.

**Gap → build:** a real agentic system prompt with an **environment block** (workspace, OS, git status,
file tree hint, date), a **per-model base prompt table**, TodoWrite-style planning discipline, and
tail-injected per-tool guidance for small models.

---

### 2. The agentic loop

**OpenCode** (`session/prompt.ts::runLoop`, `session/processor.ts`)
- `while(true)` of assistant "steps". Stop when last assistant `finish` reason is set, is NOT
  `tool-calls`, no un-executed tool parts, and `lastUser.id < lastAssistant.id`. Also checks
  `hasToolCalls` directly because *some providers return `stop` even with tool calls present*.
- **Never parses tool JSON from text** — relies on provider-native function-calling; the SDK invokes the
  tool and emits `tool-result`. Step budget injects a `MAX_STEPS_PROMPT` wrap-up at the cap.
- Doom-loop: last 3 identical `(tool,input)` → raise `doom_loop` permission ask (threshold 3).
- Retry (`session/retry.ts`): honors `retry-after`, exp backoff 2s→×2→cap 30s, always retries 5xx,
  never retries context-overflow.

**Switchboard today** (`chat.py::_agentic_sse_stream`)
- Already close: `while` up to `max_turns=10`, accumulates streamed `tool_calls` deltas, executes via
  remote agent, feeds `role:"tool"` back, retry with backoff (`_llm_stream_with_retry`), doom-loop
  detection (exact-repeat, threshold 3). SSE events: token/tool_call/tool_result/error/done.
- **Gaps:** relies purely on native tool-calls (breaks on small local models — see §4); no
  MAX_STEPS wrap-up prompt (just stops at 10); doom-loop is exact-repeat only.

---

### 3. Editing reliability ★ (highest-leverage gap)

**OpenCode** (`tool/edit.ts::replace`) — a **9-replacer fuzzy fallback chain**, first usable unique hit wins:
1. `SimpleReplacer` — exact string.
2. `LineTrimmedReplacer` — per-line `.trim()` compare (ignores leading/trailing whitespace).
3. `BlockAnchorReplacer` — blocks ≥3 lines: anchor first+last trimmed line, size within 25%, score
   middle lines by **Levenshtein similarity** (accept ≥0.65).
4. `WhitespaceNormalizedReplacer` — collapse `\s+`→space.
5. `IndentationFlexibleReplacer` — strip common min indentation both sides.
6. `EscapeNormalizedReplacer` — unescape `\n \t \'` etc.
7. `TrimmedBoundaryReplacer` — trim block boundaries.
8. `ContextAwareReplacer` — first/last anchors + ≥50% middle lines match.
9. `MultiOccurrenceReplacer` — all exact occurrences (for replaceAll).
- **Uniqueness guard:** non-unique match skipped → "provide more surrounding context".
- **Disproportionate-match guard** (`isDisproportionateMatch`): refuse when matched span ≫ oldString
  (matched lines ≥ max(old+3, old×2), or len > max(old+500, old×4)). *This is what keeps fuzzy safe.*
- **Empty-oldString on existing file → hard error** ("use write for full replacement").
- Per-file mutex, line-ending + BOM preservation, then **feeds LSP diagnostics back** into tool output.
- Second path `apply_patch` (Codex diff format) with its own 4-pass fuzzy context match.

**little-coder** — same rules as *runtime-enforced invariants* (prompt alone doesn't hold on small models):
- **Write refuses on existing file** (`write-guard`), returns the exact Edit call-shape; also guards
  `cat > file` / heredoc shell loopholes; normalizes bare `/foo.md`→`cwd/foo.md`.
- **Read-before-edit** (`read-guard-edit`): a session Set of read paths; edit on unread path is blocked
  → "Read the file first to get exact text. Do NOT guess." Files just written count as read.
- Recovery guidance: on failure, re-Read + retry Edit — **"Do NOT fall back to Write."**

**Switchboard today** — `edit_file` = single exact `old_text`→`new_text` find/replace on the remote agent
(`agent/switchboard_agent/tools.py`). **Exact match only. No fuzzy chain, no write guard, no
read-before-edit, no LSP feedback.** This is why edits fail on non-trivial changes.

**Gap → build (Phase A):** port the 9-replacer chain + disproportionate guard into the agent's
`edit` tool; add write-refuses-on-existing + read-before-edit guards; (later) LSP diagnostics feedback.

---

### 4. Local-model robustness ★ (our moat)

**little-coder** (`output-parser/parser.ts`) — recover tool-calls small models emit as **text**:
- `parseTextToolCalls` ordered: (0) Pythonic `<|tool_call_start|>[Read(path='…')]` (Liquid/LFM2),
  (1) fenced ` ```tool ` / ` ```json `, (2) `<tool_call>…</tool_call>`, (3) bare `{…"name"…}`.
- `repairJson` ladder: direct parse → escape literal newlines in strings → strip trailing commas →
  single→double quotes → quote unquoted keys → append missing `}`/`]` → extract first `{…}` → `{_raw}`.
- Quality gating: empty response / hallucinated tool name / verbatim-repeat / malformed-args → steer
  correction (capped at 2).

**OpenCode** — N/A (assumes native function-calling; for local models it suggests a JSON-schema-constrained decoder).

**Switchboard today** — none. If the model doesn't emit clean native tool-calls, the turn is wasted.

**Gap → build (Phase A):** port `repairJson` + `parseTextToolCalls` as pure Python functions in the
loop; **our advantage over little-coder — we own the loop, so we can EXECUTE the recovered call directly**
instead of just nudging. Gate on the capability profile (off for frontier models).

---

### 5. Safety / permission

**OpenCode** (`permission/index.ts`) — `(name, glob, action∈allow|ask|deny)`, **last-match-wins**,
default `ask`. `ask` blocks the tool on a Deferred promise until the UI replies (`once`/`always`/`reject`).
`always` adds an allow-rule and sweeps other pending asks; `reject` can carry correction feedback.
Modes are agents: `build` (all), `plan` (deny edits except plan file), `explore` (deny all but read-only).
Editing tools, `*.env` reads, task-spawn, external-dir, webfetch all gate.

**little-coder** — bash whitelist (`permission-gate`): splits command chain on `&&|;|`, every segment must
be in `BUILTIN_SAFE_PREFIXES` and contain no write redirection; modes auto/manual/accept-all.

**Switchboard today** — the remote agent has a static deny-list (`rm -rf /` patterns in `permissions.py`)
but **no interactive ask-flow**. It runs whatever the model asks within the deny-list.

**Gap → build (Phase B):** an ask-before-doing flow surfaced in the web UI (approve `once`/`always`),
gating edits/writes/bash-with-redirection/destructive git.

---

### 6. Context at scale / compaction

**OpenCode** (`session/compaction.ts`, `overflow.ts`)
- Overflow when tokens ≥ `input_limit − reserved(min 20k)`, checked after every step.
- **Tail-preserving summarization**: keep most recent `tail_turns` (2) within `preserve_recent_tokens`
  (clamp 2k–8k, 25% of usable); summarize the head via a dedicated `compaction` agent; store as a
  `summary:true` message; `filterCompactedEffect` replays summary + tail. Tool outputs truncated to 2000
  chars before summarizing. Auto-continue message injected after.
- **Prune (no LLM):** blank out tool outputs older than 2 turns once completed-output > 40k tokens.

**little-coder** (`context-watchdog`) — check usage every `turn_start` (small models chain dozens of tool
turns before yielding); compact at 80%; **loop-guard**: if a compaction frees < 5%, pause auto-compaction
instead of wedging. Plus `read-guard` trims oversized reads (first 30 lines + "use grep + narrow read").

**Switchboard today** (`context.py`) — a single rolling LLM summary (`SUMMARY_TRIGGER=10`, keep last 4,
excludes tool msgs) + crude tail-truncation by a `len//3` token estimate. **No real tokenizer, no
mid-run/step-level compaction, no prune-without-LLM.** `is_compacted`/`compacted_at` columns are dead.
Redis session cache caps at 40 msgs / 30 min.

**Gap → build (Phase C):** mid-run overflow check in the agent loop; tail-preserving compaction;
prune-old-tool-outputs without an LLM; a real token count per model; **tail-injection to preserve KV cache**.

---

### 7. Snapshots / undo

**OpenCode** (`snapshot/index.ts`, `session/revert.ts`) — a **shadow git repo** at
`<data>/snapshot/<projectID>/<hash>` with `--work-tree` on the real tree, seeded from the real repo's
objects via `alternates` (never touches the user's `.git`). `track()` = add-all + write-tree → hash,
called before the stream and at each step. `patch()` diffs hash vs worktree → per-step changed files.
Revert = restore base snapshot + `git checkout <hash> -- <file>` per file; delete files not in snapshot.

**Switchboard today** — `ConversationSnapshot`, `snapshot_base`, `snapshot_hash` are **dead schema**.
No checkpointing/undo/diff.

**Gap → build (Phase B):** shadow-repo (or simpler per-turn git stash/tag) snapshots on the agent side;
`/undo` and `/diff` slash commands (UI hooks already exist as prefilled prompts).

---

### 8. Sub-agents

**OpenCode** (`tool/task.ts`) — `{description, prompt, subagent_type}`; depth limit (default 1);
child session with `parentID`, **fresh isolated context** (only the prompt, not parent history);
inherits parent's `deny` + `external_directory` rules; returns the child's last text as
`<task_result>…</task_result>`. Background mode injects result into parent when done.

**little-coder** (`subagent/dispatch`) — separate child *process*, read-only toolset (no edit/write/dispatch),
distilled ≤200-word report, **serial by default on one GPU** (concurrency 1; two contend and run slower),
watchdog + retry-on-timeout.

**Switchboard today** — none.

**Gap → build (Phase D):** a `task`/`dispatch` tool that runs a sub-loop with a read-only tool subset,
returns a distilled report; **concurrency=1 default** (respect single local GPU), configurable.

---

### 9. Project awareness

**OpenCode** (`session/instruction.ts`, `lsp/`) — discover `AGENTS.md`/`CLAUDE.md`/`CONTEXT.md` by
`findUp` from cwd to worktree (first wins); **just-in-time**: when `read` touches a dir, load that dir's
nearby `AGENTS.md` once and append as a `system-reminder`. After edits, run LSP and feed **ERROR-level
diagnostics** back into the tool result ("LSP errors detected, please fix").

**Switchboard today** — none (no project rules discovery, no diagnostics).

**Gap → build (Phase D):** read a `.switchboard/AGENTS.md` from the agent workspace into the system
prompt; optional diagnostics via a `bash` lint/typecheck the profile knows about.

---

### 10. RAG (Switchboard-specific)

**Switchboard today** (`services/rag.py`, `embeddings.py`) — local `fastembed` bge-small-en-v1.5 (384-dim)
+ pgvector cosine search (`<=>`), top_k=3, distance<0.8, per-user. Injected into the system prompt under
`## Relevant knowledge` on every turn. **But nothing user-facing populates the index** — only chat summaries
and research output get indexed. No document-upload route, no per-conversation scoping, no reranking.

**Gap:** add a document/codebase ingestion route; scope retrieval; consider reranking. For the *coding
agent* specifically, RAG over the **workspace files** (index the repo, retrieve relevant files) would be
higher-value than the current chat-summary RAG.

---

## What we already have (don't rebuild)

- ✅ Redis-backed HTTP long-poll agent transport (multi-worker, durable)
- ✅ Tool set: read/write/edit/bash/grep/glob/ls (remote execution)
- ✅ Agentic loop with streamed tool-call accumulation, retry+backoff, doom-loop (exact-repeat)
- ✅ Conversation `mode`, tool-call persistence + UI, rolling summary, per-user pgvector RAG
- ✅ Per-model plumbing (multi-model gateway) — the hook for capability profiles
- ✅ **File-change diff UI** (OpenCode/Claude-Code style) — `edit_file`/`write_file` tool calls
  render an inline colored diff (added=green, removed=red) with a `+N/-M` badge in the header,
  computed client-side from the tool's `old_text`/`new_text`/`content`. See `ToolCallBlock` /
  `DiffView` / `diffLines` in `frontend/src/app/chat/agent/[id]/page.tsx`.
  *Next:* when Phase B snapshots land, source the diff from the real git patch (whole-file,
  accurate line numbers) instead of just the edit hunk.

## Dead schema to either wire up or drop

`ConversationSnapshot`, `snapshot_base`, `compacted_at`, `is_compacted`, `ToolExecution.snapshot_hash`
— defined but never read/written.

---

## Roadmap (sequenced by leverage)

**Phase A — Make it reliably edit code (the make-or-break)**
1. Port the 9-replacer fuzzy edit chain + disproportionate-match guard into the agent's `edit` tool.
2. Add write-refuses-on-existing-file + read-before-edit guards (runtime, not just prompt).
3. Port `repairJson` + `parseTextToolCalls`; execute recovered calls directly. Gate via profile.
4. Introduce the **capability-profile** registry (backbone for 3 and everything after).

**Phase B — Make it trustworthy**
5. Permission ask-flow surfaced in the web UI (edits/bash/destructive git).
6. Shadow-repo (or git stash/tag) snapshots + `/undo` + `/diff`.

**Phase C — Make it scale**
7. Real per-model token counting + tail-preserving compaction + prune-without-LLM.
8. Tail-message context injection (preserve KV cache on local servers) — big latency win.

**Phase D — Make it smart**
9. `.switchboard/AGENTS.md` project rules + optional LSP/lint diagnostics feedback.
10. `task`/`dispatch` sub-agents (read-only subset, distilled report, concurrency=1 default).
11. Workspace-file RAG for the coding agent.

**Cross-cutting now:** a real agentic system prompt with an environment block + per-model base-prompt table.

## Highest-value single move
**Phase A.** Today Switchboard *reads* but doesn't reliably *edit* — the exact-match `edit_file` fails on
real changes, and small local models don't emit clean tool-calls. The fuzzy edit chain (from OpenCode) +
the tool-call parser/repair (from little-coder) are exactly the two things that turn "an agent that reads
files" into "an agent that ships code," on both small and large models.

## Source map (for implementation)
- Editing: `D:\opencode\packages\opencode\src\tool\edit.ts` (replacers), little-coder `write-guard` / `read-guard-edit`.
- Tool-call parse/repair: `D:\little-coder\.pi\extensions\output-parser\parser.ts`.
- System prompt: `D:\opencode\...\session\system.ts` + `session\prompt\*.txt`; little-coder `AGENTS.md` + `skills\`.
- Compaction: `D:\opencode\...\session\compaction.ts`; little-coder `context-watchdog`.
- Snapshots: `D:\opencode\...\snapshot\index.ts`, `session\revert.ts`.
- Permission: `D:\opencode\...\permission\index.ts`.
- Sub-agents: `D:\opencode\...\tool\task.ts`; little-coder `subagent\`.
- Ours: `app\routes\chat.py`, `app\context.py`, `app\services\agent_tools.py`, `agent\switchboard_agent\tools.py`.
