# IntentMesh — API Contracts

## 1. API Design Rules

- JSON request/response bodies.
- Protected endpoints require an authenticated session.
- Repository endpoints require repository-level authorization.
- Validate request bodies at the API boundary.
- Return stable machine-readable error codes.
- Keep long-running analysis/sync work asynchronous.

## 2. Common Error Shape

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation."
  }
}
```

Common status codes:
- `400` invalid input
- `401` unauthenticated
- `403` unauthorized
- `404` resource not found
- `409` state conflict/duplicate resource
- `429` rate limited
- `500` unexpected server error
- `502` upstream integration failure

## 3. Repository APIs — Phase 1

### GET /api/repos

Return repositories connected by the current user.

#### Request

No body.

#### Response — 200

```json
{
  "repos": [
    {
      "id": "repo_123",
      "githubRepoId": 1234567,
      "fullName": "alice/my-project",
      "defaultBranch": "main",
      "autoSyncEnabled": false,
      "lastAnalyzedAt": null
    }
  ]
}
```

### POST /api/repos

Connect a GitHub repository.

#### Request

```json
{
  "githubRepoId": 1234567
}
```

#### Server responsibilities

1. Verify authenticated session.
2. Validate `githubRepoId`.
3. Query GitHub using the user's authorized access.
4. Verify the repository is accessible.
5. Check whether the user already connected it.
6. Insert the repo record.
7. Return the persisted repository.

#### Response — 201

```json
{
  "repo": {
    "id": "repo_123",
    "githubRepoId": 1234567,
    "fullName": "alice/my-project",
    "defaultBranch": "main",
    "autoSyncEnabled": false,
    "lastAnalyzedAt": null
  }
}
```

#### Errors

`401 UNAUTHENTICATED`

`403 REPOSITORY_ACCESS_DENIED`

`409 REPOSITORY_ALREADY_CONNECTED`

`400 INVALID_REQUEST`

## 4. Repository Detail

### GET /api/repos/:repoId

Return a single repository belonging to the current user.

#### Response — 200

```json
{
  "repo": {
    "id": "repo_123",
    "githubRepoId": 1234567,
    "fullName": "alice/my-project",
    "defaultBranch": "main",
    "autoSyncEnabled": false,
    "lastAnalyzedAt": null
  }
}
```

Unauthorized ownership should not leak whether another user's repository exists. Prefer a consistent not-found style response at the application boundary when appropriate.

## 5. Analysis APIs — Phase 2

### POST /api/repos/:repoId/analyze

Start an asynchronous repository analysis.

#### Request

No body for initial version.

#### Server flow

```text
authenticate
  -> authorize repo
  -> create analysis/sync job
  -> enqueue job
  -> return immediately
```

#### Response — 202

```json
{
  "job": {
    "id": "job_891",
    "status": "queued",
    "repoId": "repo_123"
  }
}
```

### GET /api/jobs/:jobId

Return current job state.

#### Response — 200

```json
{
  "job": {
    "id": "job_891",
    "repoId": "repo_123",
    "trigger": "manual",
    "status": "running",
    "errorMessage": null,
    "createdAt": "2026-01-01T10:00:00Z",
    "completedAt": null
  }
}
```

### GET /api/repos/:repoId/analyses/latest

Return the latest persisted analysis.

#### Response — 200

```json
{
  "analysis": {
    "id": "analysis_3",
    "repoId": "repo_123",
    "commitSha": "abc123",
    "version": 3,
    "readmeContent": "# My Project...",
    "diagramMermaid": "graph TD...",
    "techStack": {
      "language": "TypeScript",
      "framework": "Next.js"
    },
    "createdAt": "2026-01-01T10:03:00Z"
  }
}
```

## 6. Chat API — Phase 3

### POST /api/repos/:repoId/chat

Ask a question about the repository.

#### Request

```json
{
  "message": "How does authentication work?"
}
```

#### Server flow

```text
authenticate
  -> authorize repo
  -> retrieve relevant repository chunks
  -> optional agent/tool loop
  -> LLM answer
  -> persist user + assistant messages
  -> return answer
```

#### Response — 200

```json
{
  "message": {
    "id": "msg_22",
    "role": "assistant",
    "content": "Authentication is handled by ..."
  },
  "sources": [
    {
      "filePath": "src/auth.ts",
      "startLine": 1,
      "endLine": 80
    }
  ]
}
```

The MVP should prefer showing file/path evidence with answers so users can inspect where the explanation came from.

## 7. Repository Settings — Phase 4

### PATCH /api/repos/:repoId/settings

Update repository-level settings.

#### Request

```json
{
  "autoSyncEnabled": true
}
```

#### Response — 200

```json
{
  "repo": {
    "id": "repo_123",
    "autoSyncEnabled": true
  }
}
```

When auto-sync is enabled, the backend registers/configures the GitHub webhook as required by the implementation.

## 8. Webhook API — Phase 4

### POST /api/webhooks/github

Receives GitHub webhook events.

#### Rules

1. Verify GitHub webhook signature.
2. Read event type/delivery ID.
3. Identify repository.
4. Ignore unsupported event types.
5. Deduplicate delivery/event where required.
6. Create sync job.
7. Enqueue job.
8. Return a fast success response.

The webhook endpoint must not perform the full repository analysis inline.

## 9. Future/Deferred APIs

Not MVP:
- `/api/billing/*`
- team workspace APIs
- OpenAPI/API-doc generation APIs
- onboarding-guide generation
- contributor discovery/outreach
- CLI-specific APIs

These were explicitly deferred in the product plan and should not creep into the first implementation.
