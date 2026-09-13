IntentMesh — System Architecture

1. Purpose

IntentMesh is a developer-facing system that connects to GitHub repositories,
builds deterministic code intelligence, uses AI for semantic reasoning and
documentation, provides repository-grounded Q&A, and keeps generated knowledge
synchronized as repositories change.

The core product loop is:

GitHub repository
→ understand code
→ generate useful knowledge
→ answer developer questions
→ detect repository changes
→ update knowledge
→ propose documentation changes

2. Architecture Principles

Deterministic facts first

Use source-code analysis and repository APIs for facts that can be computed
reliably:

repository metadata

file existence

package dependencies

imports and exports

module relationships

changed files

Git commits and diffs

Use the LLM for semantic tasks:

summarization

explanation

documentation wording

semantic interpretation

grounded Q&A

The LLM should not be the sole source of deterministic architecture facts.

Separation of concerns

Frontend:

presentation

user interaction

appropriate client state

API layer:

authentication

authorization

request validation

synchronous business operations

enqueueing long-running jobs

Services:

reusable business logic and external integrations

Worker:

long-running analysis

static code analysis

bulk LLM work

embeddings

synchronization

GitHub PR creation

Database:

persistence

relationships

indexes

constraints

authorization/RLS where applicable

Security boundary

Repository content is untrusted input.

Secrets remain server-side.

Tool execution is controlled by the application rather than the model.

3. High-Level System

                         USER
                           │
                           ▼
                  ┌──────────────────┐
                  │  Next.js App      │
                  │  Router           │
                  │  TypeScript       │
                  │  Tailwind         │
                  └─────────┬─────────┘
                            │ HTTP
                            ▼
                  ┌──────────────────┐
                  │   API Routes     │
                  │                  │
                  │ Auth.js          │
                  │ Zod              │
                  │ Business logic   │
                  │ Drizzle          │
                  │ Octokit          │
                  └───────┬─────┬────┘
                          │     │
              ┌───────────┘     └─────────────┐
              ▼                               ▼
      ┌────────────────┐              ┌────────────────┐
      │ PostgreSQL     │              │     QStash     │
      │ + pgvector     │              │     Queue      │
      └───────┬────────┘              └───────┬────────┘
              │                               │
              │                               ▼
              │                      ┌────────────────┐
              │                      │     Worker     │
              │                      │  Node.js / TS  │
              │                      └───────┬────────┘
              │                              │
              │              ┌───────────────┼───────────────┐
              │              ▼               ▼               ▼
              │       ┌────────────┐  ┌────────────┐  ┌────────────┐
              │       │  GitHub    │  │  ts-morph  │  │ Groq LLM   │
              │       │  App/API   │  │  AST       │  │ + outputs  │
              │       └────────────┘  └────────────┘  └────────────┘
              │                              │
              └──────────────────────────────┘
                       Persist state

4. Component Responsibilities

4.1 Frontend — Next.js App Router

Responsibilities:

login/landing page

dashboard

repository connection UI

analysis progress

results

README display

Mermaid diagram rendering

repository Q&A

settings

loading/error/empty states

The browser should call IntentMesh APIs rather than directly accessing
privileged GitHub, database, Groq, or QStash credentials.

4.2 API Layer

API routes are the server-side boundary.

Responsibilities:

authenticate current user

authorize repository access

validate incoming data with Zod

call service functions

create database records

publish background jobs

receive and verify GitHub webhooks

handle synchronous chat operations as appropriate

Core endpoints:

GET /api/repos

POST /api/repos

GET /api/repos/:repoId

POST /api/repos/:repoId/analyze

GET /api/jobs/:jobId

GET /api/repos/:repoId/analyses/latest

POST /api/repos/:repoId/chat

PATCH /api/repos/:repoId/settings

POST /api/webhooks/github

4.3 Database — Supabase PostgreSQL + pgvector

Core entities:

users
repos
analyses
repo_embeddings
chat_messages
sync_jobs

Relationships:

users
  │
  └──────< repos
             │
             ├──────< analyses
             ├──────< repo_embeddings
             ├──────< chat_messages
             └──────< sync_jobs

Analyses are versioned and associated with repository commits.

Embeddings are stored in pgvector for semantic retrieval.

4.4 GitHub App + Octokit

Separate from user authentication.

Auth.js answers:

Who is the IntentMesh user?

GitHub App answers:

Which repositories has IntentMesh been authorized to access?

Use:

fine-grained repository permissions

installation IDs

short-lived installation access tokens

server-side private keys

webhook signature verification

GitHub delivery IDs for deduplication

4.5 Static Analysis — ts-morph

Runs in the worker.

Extracts deterministic source structure such as:

imports

exports

declarations

module relationships

dependency edges

It feeds the dependency graph and other structured repository context.

4.6 Diagram Engine — Mermaid

The dependency graph produced from deterministic analysis is converted to
Mermaid text.

The Mermaid representation is persisted and rendered in the frontend.

4.7 LLM — Groq

Used for semantic tasks:

documentation generation

architecture explanation

repository Q&A

agent tool selection

Whenever model output is consumed by application logic, require structured
output and validate it with Zod.

4.8 Queue — QStash

Decouples user-facing API requests from long-running analysis.

Pattern:

API
→ create job
→ publish message
→ return quickly

Then:

QStash
→ Worker

4.9 Worker

Separate Node.js/TypeScript process.

Responsible for long-running tasks:

repository ingestion

filtering

static analysis

diagram generation

documentation generation

embeddings

incremental synchronization

GitHub PR creation

5. Core Data Flows

5.1 Repository Connection

Browser
  ↓
POST /api/repos
  ↓
Auth.js session check
  ↓
Zod validation
  ↓
GitHub App / Octokit verifies repository access
  ↓
authorization
  ↓
Drizzle INSERT repos
  ↓
201 { repo }
  ↓
Browser updates dashboard

5.2 Initial Analysis

Browser
  ↓
POST /api/repos/:repoId/analyze
  ↓
authenticate + authorize
  ↓
INSERT sync_jobs = QUEUED
  ↓
publish QStash job
  ↓
202 { job }
  ↓
Worker receives job
  ↓
sync_jobs = RUNNING
  ↓
fetch repository tree/files
  ↓
filter files
  ↓
ts-morph static analysis
  ↓
dependency graph
  ↓
Mermaid text
  ↓
select bounded key context
  ↓
Groq structured documentation generation
  ↓
Zod validation
  ↓
generate embeddings
  ↓
persist versioned analysis + embeddings
  ↓
sync_jobs = COMPLETED

5.3 RAG Q&A

User question
  ↓
POST /api/repos/:repoId/chat
  ↓
authenticate + authorize
  ↓
embed question
  ↓
pgvector similarity search
  ↓
top-k repository chunks
  ↓
build grounded context
  ↓
Groq
  ↓
answer + source references
  ↓
persist chat message
  ↓
return response

6. Loop Architecture

Loops are deliberate architectural mechanisms, not a reason to make every
feature "agentic".

IntentMesh contains four useful loop types.

6.1 Agent / Tool Loop — Complex Repository Q&A

Purpose:
Allow the model to investigate the repository when one retrieval pass is not
enough.

                    ┌─────────────────────┐
                    │      Question       │
                    └──────────┬──────────┘
                               ▼
                         ┌───────────┐
                         │   Groq    │
                         │ reasoning │
                         └─────┬─────┘
                               │
                         choose tool
                               ▼
                      ┌─────────────────┐
                      │ Backend validates│
                      │ + executes tool │
                      └────────┬────────┘
                               │
                               ▼
                            Result
                               │
                               ▼
                         ┌───────────┐
                         │   Groq    │
                         └─────┬─────┘
                               │
                     more evidence needed?
                         ┌─────┴─────┐
                        YES          NO
                         │            │
                         └──────┐     ▼
                                │   Final answer
                                ▼
                           repeat loop

Tools are read-only:

search_code()

read_file()

get_dependency_graph()

get_git_diff()

retrieve_relevant_chunks()

Safety constraints:

backend executes tools

every tool execution is authorized

tool arguments are validated

maximum iterations

maximum context size

tool timeout

explicit final-answer condition

The model cannot directly bypass application security.

6.2 Verification / Revision Loop — Documentation Quality

Purpose:
Prevent generated documentation from being accepted solely because the LLM
returned text.

Generate documentation
        ↓
Deterministic validation
        ↓
Semantic evaluation where useful
        ↓
      pass?
     /        NO       YES
   ↓         ↓
Revise     Accept
   ↓
Verify again

Possible checks:

referenced files exist

generated modules exist

package/framework claims align with repository metadata

expected documentation sections exist

generated links/commands are structurally valid

architecture relationships align with deterministic analysis

The loop must have a maximum iteration count.

If verification never succeeds, mark the operation failed rather than looping
indefinitely.

6.3 Event / Synchronization Loop — GitHub Auto-Sync

Purpose:
Keep IntentMesh knowledge synchronized with repository changes.

GitHub push
    ↓
Webhook
    ↓
Verify signature
    ↓
Check delivery ID
    ↓
Deduplicate
    ↓
Create sync job
    ↓
QStash
    ↓
Worker
    ↓
Compare commits
    ↓
Changed files
    ↓
Affected analysis scope
    ↓
Incremental analysis
    ↓
Documentation generation
    ↓
Verification loop
    ↓
Persist new version
    ↓
Create GitHub PR

6.4 Reliability / Retry Loop

Purpose:
Recover from transient failures without duplicating work.

Job
 ↓
Process
 ├── success → complete
 └── transient failure
          ↓
        retry
          ↓
        process

Requirements:

jobs are idempotent

retries are bounded

duplicate webhook deliveries do not create duplicate work

terminal failures are persisted

repeated failure becomes a visible failed state

6.5 Loop Selection Rule

Use the simplest mechanism that solves the problem.

Good uses:

agent loop → complex repository investigation

verification loop → generated documentation quality

event/retry loop → synchronization and reliability

Do not add an LLM loop to simple deterministic operations.

7. Agentic Q&A Architecture

For a complex question:

Question
   ↓
initial retrieval
   ↓
Groq tool-calling mode
   ↓
tool request
   ↓
backend validates request
   ↓
tool execution
   ↓
observation
   ↓
Groq reasoning
   ↓
more tools?
 ┌─┴─────┐
YES     NO
 │       │
repeat   final answer

The agent is not a replacement for RAG. It is a bounded reasoning layer that
can request additional repository evidence.

8. Documentation Verification Architecture

The generated README/architecture result should pass deterministic checks
before it is persisted as an accepted result.

Example:

Repository
    ↓
static analysis
    ↓
structured context
    ↓
Groq generation
    ↓
Zod schema validation
    ↓
deterministic verification
    ↓
pass ───────────────→ persist
    │
    no
    ↓
revision
    ↓
verify again

9. Auto-Sync Architecture

Webhook entry

GitHub
  ↓
POST /api/webhooks/github
  ↓
HMAC-SHA256 verification
  ↓
identify repository
  ↓
read X-GitHub-Delivery
  ↓
deduplicate
  ↓
create sync job
  ↓
publish QStash message
  ↓
return quickly

Worker sync

QStash
  ↓
Worker
  ↓
load previous analysis commit
  ↓
compare previous commit to new commit
  ↓
changed files
  ↓
affected modules
  ↓
incremental static analysis
  ↓
regenerate affected documentation
  ↓
update embeddings
  ↓
verification
  ↓
new analysis version
  ↓
GitHub branch
  ↓
commit updated docs
  ↓
open PR

10. Versioning

Never overwrite previous analysis records.

Example:

Repository X

Analysis v1 → commit A
Analysis v2 → commit B
Analysis v3 → commit C

This supports:

historical state

debugging

comparison

auditing synchronization behavior

11. Security Architecture

Trust boundaries:

Browser
   │
   │ untrusted input
   ▼
API boundary
   │
   ├── authentication
   ├── authorization
   ├── validation
   ▼
Services
   │
   ├── GitHub
   ├── Database
   └── Queue

Repository content is also untrusted:

GitHub content
    ↓
ingest as DATA
    ↓
never automatically treat content as instructions

Security requirements:

server-side secrets

GitHub App private key protected

webhook HMAC verification

per-repository authorization

tenant isolation

validated tool arguments

validated structured LLM outputs

prompt injection defenses

12. Failure Handling

GitHub API failure

Worker records failure.

Transient errors may be retried.

LLM failure

Retry according to job policy.

Do not persist malformed output.

Embedding failure

Mark analysis incomplete/failed according to the job contract.

Worker crash

QStash/job delivery should permit safe retry.

The job must be idempotent.

Duplicate webhook

Use the GitHub delivery ID and/or equivalent durable event identity to avoid
duplicate processing.

Unauthorized repository

Return an appropriate authorization error and never expose repository data.

13. Scalability Direction

MVP:

Next.js
+
PostgreSQL
+
QStash
+
one worker service

As load increases:

more worker instances
        ↓
queue distributes jobs
        ↓
database remains durable source of state

Optimize before introducing microservices.

Potential future optimizations:

repository metadata caching

incremental embeddings

batching

concurrency limits

token budgets

queue backpressure

large repository safeguards

14. Observability

Track useful operational signals:

API latency

queue wait time

job duration

job retries

worker failures

GitHub API failures

LLM latency

LLM token usage

embedding latency

retrieval latency

chat latency

synchronization success rate

Logs should include safe identifiers such as:

repository ID

job ID

analysis version

commit SHA

Never log secrets or raw private repository contents unnecessarily.

15. Why This Architecture

The architectural strategy is:

Deterministic systems handle facts.

AI handles semantic reasoning.

Queues handle long-running work.

Workers handle computation.

PostgreSQL stores durable application state.

pgvector enables semantic retrieval.

Agent loops allow bounded investigation.

Verification loops control AI output quality.

Webhooks create the continuous synchronization loop.

This keeps IntentMesh understandable, testable, secure, and scalable without
adding complexity merely for appearance.