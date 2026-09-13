import { db } from '@/lib/db';
import {
  users,
  repos,
  analyses,
  syncJobs,
  documentationVersions,
  documentationPrs,
  Repo,
  User,
  Analysis,
  SyncJob,
  DocumentationVersion,
  DocumentationPr,
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function getOrCreateUser(data: {
  github_user_id: number;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
}): Promise<User> {
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.github_user_id, data.github_user_id))
    .limit(1);

  if (existingUsers.length > 0) {
    return existingUsers[0];
  }

  const [newUser] = await db
    .insert(users)
    .values({
      github_user_id: data.github_user_id,
      email: data.email ?? null,
      name: data.name ?? null,
      avatar_url: data.avatar_url ?? null,
    })
    .returning();

  return newUser;
}

export async function getUserConnectedRepos(userId: string): Promise<Repo[]> {
  return db.select().from(repos).where(eq(repos.user_id, userId));
}

export async function getRepoByIdAndUser(repoId: string, userId: string): Promise<Repo | null> {
  const res = await db
    .select()
    .from(repos)
    .where(and(eq(repos.id, repoId), eq(repos.user_id, userId)))
    .limit(1);
  return res[0] ?? null;
}

export async function getRepoById(repoId: string): Promise<Repo | null> {
  const res = await db.select().from(repos).where(eq(repos.id, repoId)).limit(1);
  return res[0] ?? null;
}

export async function getRepoByGithubRepoId(githubRepoId: number): Promise<Repo | null> {
  const res = await db.select().from(repos).where(eq(repos.github_repo_id, githubRepoId)).limit(1);
  return res[0] ?? null;
}

export async function updateRepoAutoSync(repoId: string, autoSyncEnabled: boolean): Promise<Repo | null> {
  const [updated] = await db
    .update(repos)
    .set({ auto_sync_enabled: autoSyncEnabled })
    .where(eq(repos.id, repoId))
    .returning();
  return updated ?? null;
}

export async function connectRepository(data: {
  user_id: string;
  github_repo_id: number;
  full_name: string;
  default_branch: string;
  installation_id: number;
}): Promise<Repo> {
  const existingRepos = await db
    .select()
    .from(repos)
    .where(and(eq(repos.user_id, data.user_id), eq(repos.github_repo_id, data.github_repo_id)))
    .limit(1);

  if (existingRepos.length > 0) {
    return existingRepos[0];
  }

  const [newRepo] = await db
    .insert(repos)
    .values({
      user_id: data.user_id,
      github_repo_id: data.github_repo_id,
      full_name: data.full_name,
      default_branch: data.default_branch,
      installation_id: data.installation_id,
      auto_sync_enabled: false,
    })
    .returning();

  return newRepo;
}

export async function createAnalysis(repoId: string): Promise<Analysis> {
  const [analysis] = await db
    .insert(analyses)
    .values({
      repo_id: repoId,
      status: 'queued',
    })
    .returning();

  return analysis;
}

export async function getAnalysisById(analysisId: string): Promise<Analysis | null> {
  const res = await db.select().from(analyses).where(eq(analyses.id, analysisId)).limit(1);
  return res[0] ?? null;
}

export async function getLatestCompletedAnalysis(repoId: string): Promise<Analysis | null> {
  const res = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.repo_id, repoId), eq(analyses.status, 'completed')))
    .orderBy(desc(analyses.created_at))
    .limit(1);
  return res[0] ?? null;
}

export async function updateAnalysis(
  analysisId: string,
  updates: Partial<Analysis>
): Promise<Analysis | null> {
  const [updated] = await db
    .update(analyses)
    .set(updates)
    .where(eq(analyses.id, analysisId))
    .returning();
  return updated ?? null;
}

export async function updateRepoLastAnalyzed(repoId: string): Promise<void> {
  await db.update(repos).set({ last_analyzed_at: new Date() }).where(eq(repos.id, repoId));
}

export async function createSyncJob(data: {
  repo_id: string;
  github_delivery_id: string;
  event_type: string;
  commit_sha?: string | null;
  changed_files?: unknown;
}): Promise<SyncJob> {
  const [job] = await db
    .insert(syncJobs)
    .values({
      repo_id: data.repo_id,
      github_delivery_id: data.github_delivery_id,
      event_type: data.event_type,
      status: 'queued',
      commit_sha: data.commit_sha ?? null,
      changed_files: data.changed_files ?? null,
    })
    .returning();

  return job;
}

export async function getSyncJobById(syncJobId: string): Promise<SyncJob | null> {
  const res = await db.select().from(syncJobs).where(eq(syncJobs.id, syncJobId)).limit(1);
  return res[0] ?? null;
}

export async function getSyncJobByDeliveryId(deliveryId: string): Promise<SyncJob | null> {
  const res = await db.select().from(syncJobs).where(eq(syncJobs.github_delivery_id, deliveryId)).limit(1);
  return res[0] ?? null;
}

export async function updateSyncJob(
  syncJobId: string,
  updates: Partial<SyncJob>
): Promise<SyncJob | null> {
  const [updated] = await db
    .update(syncJobs)
    .set(updates)
    .where(eq(syncJobs.id, syncJobId))
    .returning();
  return updated ?? null;
}

export async function getRecentSyncJobs(repoId: string, limit = 5): Promise<SyncJob[]> {
  return db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.repo_id, repoId))
    .orderBy(desc(syncJobs.created_at))
    .limit(limit);
}

export async function getDocVersionById(docVersionId: string): Promise<DocumentationVersion | null> {
  const res = await db.select().from(documentationVersions).where(eq(documentationVersions.id, docVersionId)).limit(1);
  return res[0] ?? null;
}

export async function getLatestDocVersionForRepo(repoId: string): Promise<DocumentationVersion | null> {
  const res = await db
    .select()
    .from(documentationVersions)
    .where(eq(documentationVersions.repo_id, repoId))
    .orderBy(desc(documentationVersions.created_at))
    .limit(1);
  return res[0] ?? null;
}

export async function createDocumentationPrRecord(data: {
  repo_id: string;
  documentation_version_id: string;
  branch_name: string;
  pull_request_number: number;
  pull_request_url: string;
}): Promise<DocumentationPr> {
  const existing = await db
    .select()
    .from(documentationPrs)
    .where(
      and(
        eq(documentationPrs.repo_id, data.repo_id),
        eq(documentationPrs.documentation_version_id, data.documentation_version_id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [prRecord] = await db
    .insert(documentationPrs)
    .values({
      repo_id: data.repo_id,
      documentation_version_id: data.documentation_version_id,
      branch_name: data.branch_name,
      pull_request_number: data.pull_request_number,
      pull_request_url: data.pull_request_url,
      status: 'open',
    })
    .returning();

  return prRecord;
}

export async function getDocumentationPrByVersion(docVersionId: string): Promise<DocumentationPr | null> {
  const res = await db
    .select()
    .from(documentationPrs)
    .where(eq(documentationPrs.documentation_version_id, docVersionId))
    .limit(1);
  return res[0] ?? null;
}
