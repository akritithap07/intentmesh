IntentMesh — Build Plan

Product Goal

Build a production-minded developer SaaS that connects to GitHub repositories, builds deterministic code intelligence, generates persistent documentation and architecture information, provides grounded repository Q&A, and synchronizes documentation as code changes.

Phase 0 — Requirements, Architecture, Audit

Deliver:

CLAUDE.md

docs/architecture.md

docs/api.md

docs/build-plan.md

docs/stack.md

current-state/deep-audit when needed

Done when product scope, architecture, API contracts, technology choices, and bounded loops are documented.

Phase 1 — Foundation: Auth + Repository Connection

Goal:
GitHub login → dashboard → connect repository → persist repository → display it.

Build:

Next.js App Router, TypeScript, Tailwind

Node.js

Supabase PostgreSQL + Drizzle

users and repos

Auth.js

GitHub App strategy + server-side Octokit

GET /api/repos

POST /api/repos

GET /api/repos/:repoId

landing/login, dashboard, repository picker/cards

loading/empty/error states

repository ownership authorization

duplicate prevention

.env.example

Done when a user can sign in, connect an accessible repository, refresh and still see it, while invalid/unauthorized/duplicate requests fail safely.

Phase 2 — Asynchronous Repository Analysis

Goal:
Connect repository → enqueue job → worker analyzes → persist result.

Build:

analyses

sync_jobs

QStash

separate Node/TypeScript worker

repository tree/file ingestion

file filtering

ts-morph static dependency analysis

Mermaid diagram text

Groq structured documentation generation

Zod validation

versioned persistence

embeddings pipeline

analysis progress/job status

results page

Done when analysis runs asynchronously and persists README/architecture results with analysis version and commit SHA.

Phase 3 — RAG Repository Q&A

Goal:
Grounded questions about repository code.

Build:

pgvector

repo_embeddings

semantic code/document chunks

embedding generation during analysis

similarity retrieval

POST /api/repos/:repoId/chat

chat persistence

source/file references in UI

Done when repository questions return answers grounded in retrieved code.

Phase 4 — GitHub App Webhooks + Auto-Sync

Goal:
Repository changes trigger automatic documentation synchronization.

Build:

GitHub App installation/access

repository permissions

installation IDs

webhook handler

HMAC signature verification

delivery deduplication

QStash job dispatch

commit diff/change-set detection

affected-file analysis

incremental documentation/embedding updates

new analysis version

documentation branch/commit/PR

auto-sync settings and status

Done when a GitHub push flows through webhook → queue → worker → incremental analysis → verification → documentation PR.

Phase 5 — Reliability, Security, Verification

Build:

retries

timeouts

idempotency

failure states

deterministic documentation checks

generation → verification → revision loop

prompt-injection defenses

tenant isolation

secret handling

observability

Verification examples:

referenced files exist

major modules are covered

generated claims align with static analysis

expected documentation sections exist

links/commands are structurally valid

Every verification loop is bounded and may fail safely.

Phase 6 — Agentic Repository Q&A

Goal:
Complex Q&A with bounded read-only tool use.

Tools:

search_code()

read_file()

get_dependency_graph()

get_git_diff()

retrieve_relevant_chunks()

Loop:
question → model → tool → backend execution → observation → repeat → final answer.

Constraints:

read-only tools

authorization on every execution

maximum iterations

tool timeouts

context limits

explicit final-answer condition

Phase 7 — Performance and Cost

Optimize:

repository metadata caching

incremental embeddings

batching

concurrency limits

token budgets

queue backpressure

large-repository safeguards

Measure:

cost per analysis

tokens per analysis

analysis duration

retrieval quality

chat latency

worker throughput

Phase 8 — Product Hardening

Build:

polished developer dashboard

documentation history

critical-path test coverage

CI/CD

production config

observability

architecture/decision documentation

Interview readiness:
frontend/backend boundary, HTTP/API lifecycle, auth vs authorization, database design, queues/workers, idempotency, webhooks, static analysis vs LLM reasoning, embeddings, RAG, tool calling, agent loops, verification loops, security, scalability, and cost controls.

Explicitly Out of Initial MVP

Stripe billing

team workspaces

CLI/CI mode

OpenAPI generation

API documentation generation

contributor discovery/outreach

large multi-agent swarm architectures

Development Method

For every phase:

Read relevant docs.

Define the smallest vertical slice.

Implement it.

Test it.

Verify manually.

Update docs if a decision changed.

Proceed only after the previous slice is working.