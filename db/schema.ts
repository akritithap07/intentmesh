import {
  pgTable,
  uuid,
  bigint,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  vector,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  github_user_id: bigint('github_user_id', { mode: 'number' }).notNull().unique(),
  email: text('email'),
  name: text('name'),
  avatar_url: text('avatar_url'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const repos = pgTable(
  'repos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    github_repo_id: bigint('github_repo_id', { mode: 'number' }).notNull(),
    full_name: text('full_name').notNull(),
    default_branch: text('default_branch').notNull(),
    installation_id: bigint('installation_id', { mode: 'number' }).notNull(),
    auto_sync_enabled: boolean('auto_sync_enabled').notNull().default(false),
    webhook_id: text('webhook_id'),
    last_analyzed_at: timestamp('last_analyzed_at'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('repos_user_id_github_repo_id_unique').on(table.user_id, table.github_repo_id),
    index('repos_user_id_idx').on(table.user_id),
    index('repos_github_repo_id_idx').on(table.github_repo_id),
  ]
);

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repo_id: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'completed' | 'failed'
    commit_sha: text('commit_sha'),
    started_at: timestamp('started_at'),
    completed_at: timestamp('completed_at'),
    error_message: text('error_message'),
    architecture_data: jsonb('architecture_data'),
    mermaid_diagram: text('mermaid_diagram'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('analyses_repo_id_idx').on(table.repo_id),
    index('analyses_status_idx').on(table.status),
    index('analyses_created_at_idx').on(table.created_at),
  ]
);

export const repoChunks = pgTable(
  'repo_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repo_id: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    analysis_id: uuid('analysis_id').references(() => analyses.id, { onDelete: 'cascade' }),
    file_path: text('file_path').notNull(),
    chunk_index: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    content_hash: text('content_hash').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('repo_chunks_repo_id_idx').on(table.repo_id),
    index('repo_chunks_analysis_id_idx').on(table.analysis_id),
    index('repo_chunks_content_hash_idx').on(table.content_hash),
  ]
);

export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repo_id: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    github_delivery_id: text('github_delivery_id').notNull().unique(),
    event_type: text('event_type').notNull(),
    status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'completed' | 'failed'
    commit_sha: text('commit_sha'),
    changed_files: jsonb('changed_files'),
    error_message: text('error_message'),
    created_at: timestamp('created_at').notNull().defaultNow(),
    started_at: timestamp('started_at'),
    completed_at: timestamp('completed_at'),
  },
  (table) => [
    index('sync_jobs_repo_id_idx').on(table.repo_id),
    index('sync_jobs_status_idx').on(table.status),
    index('sync_jobs_created_at_idx').on(table.created_at),
  ]
);

export const documentationVersions = pgTable(
  'documentation_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repo_id: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    analysis_id: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    document_type: text('document_type').notNull().default('README.md'),
    content: text('content').notNull(),
    content_hash: text('content_hash').notNull(),
    status: text('status').notNull().default('generated'), // 'generated' | 'verified' | 'failed'
    verification_notes: text('verification_notes'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('doc_versions_repo_id_idx').on(table.repo_id),
    index('doc_versions_analysis_id_idx').on(table.analysis_id),
  ]
);

export const documentationPrs = pgTable(
  'documentation_prs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repo_id: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    documentation_version_id: uuid('documentation_version_id')
      .notNull()
      .references(() => documentationVersions.id, { onDelete: 'cascade' }),
    branch_name: text('branch_name').notNull(),
    pull_request_number: integer('pull_request_number').notNull(),
    pull_request_url: text('pull_request_url').notNull(),
    status: text('status').notNull().default('open'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('doc_prs_repo_version_unique').on(table.repo_id, table.documentation_version_id),
    index('doc_prs_repo_id_idx').on(table.repo_id),
  ]
);

// Zod schemas for validation
export const insertUserSchema = z.object({
  github_user_id: z.number().int(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
});

export const selectUserSchema = z.object({
  id: z.string().uuid(),
  github_user_id: z.number().int(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: z.date(),
});

export const insertRepoSchema = z.object({
  user_id: z.string().uuid(),
  github_repo_id: z.number().int(),
  full_name: z.string().min(1),
  default_branch: z.string().min(1),
  installation_id: z.number().int(),
  auto_sync_enabled: z.boolean().optional(),
  webhook_id: z.string().nullable().optional(),
  last_analyzed_at: z.date().nullable().optional(),
});

export const selectRepoSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  github_repo_id: z.number().int(),
  full_name: z.string(),
  default_branch: z.string(),
  installation_id: z.number().int(),
  auto_sync_enabled: z.boolean(),
  webhook_id: z.string().nullable(),
  last_analyzed_at: z.date().nullable(),
  created_at: z.date(),
});

export const insertAnalysisSchema = z.object({
  repo_id: z.string().uuid(),
  status: z.enum(['queued', 'running', 'completed', 'failed']).optional().default('queued'),
  commit_sha: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  architecture_data: z.record(z.string(), z.any()).nullable().optional(),
  mermaid_diagram: z.string().nullable().optional(),
});

export const askQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
});

export const toggleAutoSyncSchema = z.object({
  auto_sync_enabled: z.boolean(),
});

export const createPrSchema = z.object({
  docVersionId: z.string().uuid(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
export type RepoChunk = typeof repoChunks.$inferSelect;
export type NewRepoChunk = typeof repoChunks.$inferInsert;
export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;
export type DocumentationVersion = typeof documentationVersions.$inferSelect;
export type NewDocumentationVersion = typeof documentationVersions.$inferInsert;
export type DocumentationPr = typeof documentationPrs.$inferSelect;
export type NewDocumentationPr = typeof documentationPrs.$inferInsert;
