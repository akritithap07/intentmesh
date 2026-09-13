IntentMesh — Technology Decisions

This is the canonical technology decision record.

1. Frontend

Decision: Next.js App Router + TypeScript + Tailwind CSS.

Reason: developer-facing dashboard, server-side capabilities, API routes, and interactive client components in one understandable application.

2. Backend / API

Decision: Next.js server-side API routes.

Reason: the MVP does not need a second backend framework such as Express or Hono. Keep the boundary explicit:
Browser → Next.js API → services → database/integrations/queue.

API style: explicit HTTP/REST routes.

3. Runtime

Decision: Node.js.

Reason: common TypeScript server runtime and consistent foundation for the future separate analysis worker.

4. Database

Decision: Supabase PostgreSQL.

Reason: relational persistence plus pgvector, with managed hosting and PostgreSQL features such as foreign keys, transactions, indexes and RLS capabilities.

5. ORM

Decision: Drizzle ORM.

Reason: strong TypeScript integration while keeping SQL concepts visible and the schema explicit.

Rules:

use migrations

use database constraints for invariants

add indexes intentionally

6. Vector Search

Decision: pgvector.

Reason: semantic repository retrieval can live in the same PostgreSQL environment as repository metadata and analysis records.

Flow:
file chunks → embedding model → vector → pgvector
question → embedding → similarity search → relevant chunks

The embedding model/dimension is intentionally not permanently locked yet.

7. User Authentication

Decision: Auth.js.

Auth.js answers: "Who is the IntentMesh user?"

It is separate from repository authorization.

8. GitHub Repository Integration

Decision: GitHub App + Octokit.

GitHub App answers: "Which repositories has IntentMesh been granted access to, and with what permissions?"

Why:

repository-level access

fine-grained permissions

webhooks

repository reads

future documentation PR creation

Use short-lived installation access tokens. Keep the private key server-side.

Webhook verification:

X-Hub-Signature-256

HMAC-SHA256

X-GitHub-Delivery for deduplication

9. LLM

Decision: Groq API.

Reason: the product specification chose Groq with emphasis on speed and cost control.

Use for:

documentation generation

semantic explanations

repository Q&A

tool selection in the agent loop

Do not use it for facts that deterministic analysis can obtain directly.

Whenever downstream application code consumes model output, use structured output and validate it with Zod.

The exact Groq model is an implementation choice to evaluate later.

10. Static Code Analysis

Decision: ts-morph.

Use for:

imports

exports

declarations

module relationships

dependency graphs

Static analysis is worker-only.

11. Diagram

Decision: Mermaid.

Reason:

text representation

easy to persist

git-diffable

straightforward UI rendering

Graph relationships should come from deterministic analysis. LLMs may explain them but should not be the sole source of dependency edges.

12. Queue

Decision: QStash.

Reason: analysis, embeddings, synchronization and documentation generation can exceed normal request lifecycles.

Pattern:
API → create job → publish QStash message → worker → persist state.

13. Worker

Decision: separate Node.js/TypeScript process.

Responsibilities:

repository ingestion

file filtering

ts-morph analysis

Mermaid generation

Groq documentation generation

embeddings

incremental sync

GitHub PR creation

14. Validation

Decision: Zod.

Use for:

API inputs

tool arguments

structured LLM outputs

important integration boundaries

15. AI / Loop Architecture

RAG

question → embedding → pgvector → top-k repository chunks → Groq → grounded answer.

Agent loop

question → Groq → select read-only tool → backend validates/execut es → observation → Groq → repeat → final answer.

Tools:

search_code()

read_file()

get_dependency_graph()

get_git_diff()

retrieve_relevant_chunks()

Every agent loop has:

max iterations

tool timeouts

context limits

explicit stopping condition

Verification loop

generate → evaluate/validate → revise if necessary → evaluate → accept/reject.

Every loop must be bounded and justified by a quality objective. Do not add loops to simple deterministic operations.

16. Environment Variables

Expected names:

DATABASE_URL

AUTH_SECRET

GITHUB_APP_ID

GITHUB_APP_PRIVATE_KEY

GITHUB_WEBHOOK_SECRET

GROQ_API_KEY

QSTASH_TOKEN

QSTASH_CURRENT_SIGNING_KEY

QSTASH_NEXT_SIGNING_KEY

NEXT_PUBLIC_APP_URL

Never commit secret values or expose server secrets to client bundles.

17. Things We Are Not Introducing Initially

Hono/Express/Fastify as a second API server

tRPC

separate vector database

Kubernetes

unnecessary microservices

multi-agent swarm frameworks

Stripe billing

team/workspace infrastructure

18. Decision Governance

If a technology decision needs to change:

explain the problem

compare alternatives and tradeoffs

update this document

update architecture/API docs if affected

only then implement the change