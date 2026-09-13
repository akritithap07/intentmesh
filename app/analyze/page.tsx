'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  owner: string;
}

interface ConnectedRepo {
  id: string;
  user_id: string;
  github_repo_id: number;
  full_name: string;
  default_branch: string;
  installation_id: number;
  auto_sync_enabled: boolean;
  last_analyzed_at: string | null;
  created_at: string;
}

interface AnalysisResult {
  id: string;
  repo_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  commit_sha: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  architecture_data: {
    metadata?: {
      totalFiles?: number;
      supportedFilesCount?: number;
      commitSha?: string;
    };
    modules?: Array<{ path: string; imports: unknown[]; exports: unknown[] }>;
    externalDependencies?: string[];
  } | null;
  mermaid_diagram: string | null;
  created_at: string;
}

interface SyncJobItem {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  event_type: string;
  commit_sha: string | null;
  created_at: string;
}

interface QaResponse {
  answer: string;
  sources: Array<{ filePath: string; chunkIndex: number }>;
  toolsUsed?: string[];
  totalToolCalls?: number;
}

interface DocVersion {
  id: string;
  repo_id: string;
  analysis_id: string;
  document_type: string;
  content: string;
  status: 'generated' | 'verified' | 'failed';
  verification_notes: string | null;
  created_at: string;
}

interface DocPr {
  id: string;
  branch_name: string;
  pull_request_number: number;
  pull_request_url: string;
  status: string;
  created_at: string;
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="7" r="3.5" fill="#ff2d78" />
      <circle cx="5" cy="25" r="3" fill="white" fillOpacity="0.75" />
      <circle cx="27" cy="25" r="3" fill="white" fillOpacity="0.75" />
      <circle cx="16" cy="19" r="2.5" fill="#ff2d78" fillOpacity="0.55" />
      <line x1="16" y1="7" x2="5" y2="25" stroke="#ff2d78" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="16" y1="7" x2="27" y2="25" stroke="#ff2d78" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="5" y1="25" x2="27" y2="25" stroke="white" strokeWidth="1" strokeOpacity="0.2" />
      <line x1="16" y1="7" x2="16" y2="19" stroke="#ff2d78" strokeWidth="1" strokeOpacity="0.4" />
      <line x1="5" y1="25" x2="16" y2="19" stroke="white" strokeWidth="1" strokeOpacity="0.2" />
      <line x1="27" y1="25" x2="16" y2="19" stroke="white" strokeWidth="1" strokeOpacity="0.2" />
    </svg>
  );
}

export default function AnalyzePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [myRepos, setMyRepos] = useState<GitHubRepo[]>([]);
  const [connectedRepos, setConnectedRepos] = useState<ConnectedRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState('');
  const [connectingFullName, setConnectingFullName] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'connected' | 'repos' | 'url'>('connected');

  // Analysis & Sync State
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzingRepoId, setAnalyzingRepoId] = useState<string | null>(null);
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [latestSyncJobs, setLatestSyncJobs] = useState<Record<string, SyncJobItem>>({});

  // Q&A State
  const [selectedRepoForQa, setSelectedRepoForQa] = useState<ConnectedRepo | null>(null);
  const [questionInput, setQuestionInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaResponse, setQaResponse] = useState<QaResponse | null>(null);
  const [qaError, setQaError] = useState('');

  // Documentation & PR State
  const [docLoading, setDocLoading] = useState(false);
  const [prLoading, setPrLoading] = useState(false);
  const [activeDocVersion, setActiveDocVersion] = useState<DocVersion | null>(null);
  const [activeDocPr, setActiveDocPr] = useState<DocPr | null>(null);
  const [docError, setDocError] = useState('');

  useEffect(() => {
    if (status === 'authenticated') {
      setReposLoading(true);

      fetch('/api/github/repos')
        .then((r) => r.json())
        .then((data) => {
          if (data.repos) setMyRepos(data.repos);
          else setReposError('Could not load repositories.');
        })
        .catch(() => setReposError('Failed to load repositories.'))
        .finally(() => setReposLoading(false));

      fetch('/api/repos')
        .then((r) => r.json())
        .then((data) => {
          if (data.repos) {
            setConnectedRepos(data.repos);
            if (data.repos.length > 0 && !selectedRepoForQa) {
              setSelectedRepoForQa(data.repos[0]);
            }
          }
        })
        .catch(() => console.error('Failed to load connected repositories.'));
    }
  }, [status]);

  useEffect(() => {
    if (!activeAnalysis || activeAnalysis.status === 'completed' || activeAnalysis.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyses/${activeAnalysis.id}`);
        if (res.ok) {
          const data: AnalysisResult = await res.json();
          setActiveAnalysis(data);
          if (data.status === 'completed' || data.status === 'failed') {
            setAnalyzingRepoId(null);
          }
        }
      } catch (err) {
        console.error('Failed polling analysis status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeAnalysis]);

  const handleGenerateDoc = async (repoId: string) => {
    setDocLoading(true);
    setDocError('');
    setActiveDocVersion(null);
    setActiveDocPr(null);

    try {
      const res = await fetch(`/api/repos/${repoId}/docs/generate`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setDocError(data.error || 'Failed generating documentation');
        return;
      }

      setActiveDocVersion(data.docVersion);
    } catch {
      setDocError('Error generating documentation.');
    } finally {
      setDocLoading(false);
    }
  };

  const handleCreatePr = async (repoId: string, docVersionId: string) => {
    setPrLoading(true);
    setDocError('');

    try {
      const res = await fetch(`/api/repos/${repoId}/docs/pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docVersionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setDocError(data.error || 'Failed creating Pull Request');
        return;
      }

      setActiveDocPr(data.docPr);
    } catch {
      setDocError('Error creating Pull Request.');
    } finally {
      setPrLoading(false);
    }
  };

  const handleToggleAutoSync = async (repoId: string, currentVal: boolean) => {
    try {
      const res = await fetch(`/api/repos/${repoId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_sync_enabled: !currentVal }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnectedRepos((prev) =>
          prev.map((r) => (r.id === repoId ? { ...r, auto_sync_enabled: data.repo.auto_sync_enabled } : r))
        );
      }
    } catch (err) {
      console.error('Failed toggling auto sync:', err);
    }
  };

  const handleManualSync = async (repoId: string) => {
    setSyncingRepoId(repoId);
    try {
      const res = await fetch(`/api/repos/${repoId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLatestSyncJobs((prev) => ({
          ...prev,
          [repoId]: {
            id: data.syncJobId,
            status: data.status,
            event_type: 'manual',
            commit_sha: null,
            created_at: new Date().toISOString(),
          },
        }));
      }
    } catch (err) {
      console.error('Failed triggering manual sync:', err);
    } finally {
      setSyncingRepoId(null);
    }
  };

  const handleStartAnalysis = async (repoId: string) => {
    setAnalyzingRepoId(repoId);
    setReposError('');

    try {
      const res = await fetch(`/api/repos/${repoId}/analyze`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setReposError(data.error || 'Failed to start analysis');
        setAnalyzingRepoId(null);
        return;
      }

      setActiveAnalysis({
        id: data.analysisId,
        repo_id: repoId,
        status: data.status,
        commit_sha: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        architecture_data: null,
        mermaid_diagram: null,
        created_at: new Date().toISOString(),
      });
    } catch {
      setReposError('Failed starting repository analysis.');
      setAnalyzingRepoId(null);
    }
  };

  const handleAskQuestion = async (q?: string) => {
    const targetQuestion = q || questionInput;
    if (!targetQuestion.trim() || !selectedRepoForQa) return;

    setQaLoading(true);
    setQaError('');
    setQaResponse(null);

    try {
      const res = await fetch(`/api/repos/${selectedRepoForQa.id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: targetQuestion }),
      });

      const data = await res.json();

      if (!res.ok) {
        setQaError(data.error || 'Failed to process question');
        return;
      }

      setQaResponse(data);
    } catch {
      setQaError('Error asking question. Please try again.');
    } finally {
      setQaLoading(false);
    }
  };

  const handleConnectRepo = async (fullName: string) => {
    setConnectingFullName(fullName);
    setReposError('');
    setConnectSuccess(null);

    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setReposError(data.error || 'Failed to connect repository.');
        return;
      }

      setConnectSuccess(`Successfully connected ${fullName}`);
      setConnectedRepos((prev) => {
        const exists = prev.some((r) => r.id === data.repo.id);
        if (exists) return prev;
        return [data.repo, ...prev];
      });

      setSelectedRepoForQa(data.repo);
      setTab('connected');
    } catch {
      setReposError('An unexpected error occurred connecting the repository.');
    } finally {
      setConnectingFullName(null);
    }
  };

  const handleUrlSubmit = async () => {
    setUrlError('');
    const trimmed = urlInput.trim();
    const match = trimmed.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s?#]+)/);
    if (!match) {
      setUrlError('Please enter a valid GitHub repository URL (e.g. github.com/owner/repo).');
      return;
    }
    const owner = match[1];
    const name = match[2].replace(/\.git$/, '');
    const fullName = `${owner}/${name}`;

    if (status === 'authenticated') {
      await handleConnectRepo(fullName);
    } else {
      sessionStorage.setItem(
        'intentmesh_selected_repo',
        JSON.stringify({
          url: `https://github.com/${fullName}`,
          name,
          fullName,
          description: null,
          language: null,
          private: false,
          owner,
        })
      );
      router.push('/analyze/questions');
    }
  };

  const filteredRepos = myRepos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Nunito', sans-serif; background: #000; color: #fff; min-height: 100vh; overflow-x: hidden; }
        body::before {
          content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 60% 50% at 20% 10%, rgba(255,45,120,0.09) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 80% 90%, rgba(255,45,120,0.06) 0%, transparent 60%);
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        a, button, input { font-family: 'Nunito', sans-serif; }
        .fi {
          width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px; padding: 16px 20px; font-size: 15px; font-weight: 600; color: #fff;
          outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .fi::placeholder { color: #444; font-weight: 500; }
        .fi:focus { border-color: rgba(255,45,120,0.5); box-shadow: 0 0 0 3px rgba(255,45,120,0.08); background: rgba(255,255,255,0.07); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,45,120,0.4); border-radius: 4px; }
      `}</style>

      {/* NAV */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          width: 'calc(100% - 48px)',
          maxWidth: 920,
          borderRadius: 20,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <LogoMark size={22} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
              Intent<span style={{ color: '#ff2d78' }}>Mesh</span>
            </span>
          </a>
          {status === 'authenticated' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#aaa', fontWeight: 600 }}>{session.user?.name ?? session.user?.email}</span>
              <button
                onClick={() => signOut()}
                style={{
                  padding: '7px 16px',
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'rgba(255,255,255,0.05)',
                  color: '#777',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn('github')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 18px',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 700,
                background: '#fff',
                color: '#000',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Sign in with GitHub
            </button>
          )}
        </div>
      </motion.div>

      <div style={{ paddingTop: 100, paddingBottom: 60, position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px' }}>
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ textAlign: 'center', marginBottom: 44 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#ff2d78', marginBottom: 12 }}>
              Phase 5 Bounded Agentic Q&amp;A
            </p>
            <h1 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, color: '#fff', letterSpacing: -1.5, marginBottom: 12 }}>
              Agentic Repository Q&amp;A
            </h1>
            <p style={{ fontSize: 15, color: '#888', fontWeight: 500 }}>Bounded multi-step tool loop investigation powered by Groq &amp; static analysis</p>
          </motion.div>

          {/* Feedback messages */}
          {connectSuccess && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(45,255,120,0.1)', border: '1px solid rgba(45,255,120,0.3)', color: '#4dff91', fontSize: 14, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>
              ✓ {connectSuccess}
            </motion.div>
          )}

          {reposError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,45,45,0.1)', border: '1px solid rgba(255,45,45,0.3)', color: '#ff7070', fontSize: 14, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>
              ⚠ {reposError}
            </motion.div>
          )}

          {docError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,45,45,0.1)', border: '1px solid rgba(255,45,45,0.3)', color: '#ff7070', fontSize: 14, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>
              ⚠ {docError}
            </motion.div>
          )}

          {/* Generated Documentation & PR Result Box */}
          {activeDocVersion && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: '28px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,45,120,0.3)',
                marginBottom: 36,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Generated Documentation</h2>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Type: {activeDocVersion.document_type} | Version: {activeDocVersion.id.substring(0, 8)}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '4px 14px',
                      borderRadius: 100,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      background: activeDocVersion.status === 'verified' ? 'rgba(45,255,120,0.15)' : 'rgba(255,45,45,0.15)',
                      color: activeDocVersion.status === 'verified' ? '#4dff91' : '#ff7070',
                      border: '1px solid currentColor',
                    }}
                  >
                    {activeDocVersion.status}
                  </span>

                  {activeDocVersion.status === 'verified' && selectedRepoForQa && (
                    <button
                      disabled={prLoading}
                      onClick={() => handleCreatePr(selectedRepoForQa.id, activeDocVersion.id)}
                      style={{
                        padding: '8px 18px',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 800,
                        background: '#ff2d78',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: prLoading ? 0.6 : 1,
                      }}
                    >
                      {prLoading ? 'Creating PR…' : '🚀 Create GitHub PR'}
                    </button>
                  )}
                </div>
              </div>

              {activeDocVersion.verification_notes && (
                <p style={{ fontSize: 12, color: '#aaa', marginBottom: 16, padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  🔍 Verification Findings: {activeDocVersion.verification_notes}
                </p>
              )}

              {/* PR Outcome Details */}
              {activeDocPr && (
                <div style={{ padding: '16px 20px', borderRadius: 14, background: 'rgba(77,255,145,0.08)', border: '1px solid rgba(77,255,145,0.3)', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: '#4dff91' }}>✓ GitHub Pull Request Opened</h3>
                  <p style={{ fontSize: 13, color: '#ddd', marginTop: 4 }}>
                    PR #{activeDocPr.pull_request_number} on branch <code style={{ color: '#ff2d78' }}>{activeDocPr.branch_name}</code>
                  </p>
                  <a
                    href={activeDocPr.pull_request_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: 10, fontSize: 13, fontWeight: 800, color: '#fff', textDecoration: 'underline' }}
                  >
                    View Pull Request on GitHub →
                  </a>
                </div>
              )}

              {/* README Preview Box */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>README.md Preview</h3>
                <pre
                  style={{
                    padding: '20px',
                    borderRadius: 14,
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 13,
                    color: '#eee',
                    overflowX: 'auto',
                    maxHeight: '400px',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                  }}
                >
                  {activeDocVersion.content}
                </pre>
              </div>
            </motion.div>
          )}

          {/* Repository Q&A Grounded Query Box */}
          {selectedRepoForQa && status === 'authenticated' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '28px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: 36,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Ask {selectedRepoForQa.full_name}</h2>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Bounded multi-step tool loop investigation</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    disabled={docLoading}
                    onClick={() => handleGenerateDoc(selectedRepoForQa.id)}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 100,
                      fontSize: 12,
                      fontWeight: 800,
                      background: 'rgba(255,45,120,0.15)',
                      color: '#ff2d78',
                      border: '1px solid rgba(255,45,120,0.3)',
                      cursor: 'pointer',
                      opacity: docLoading ? 0.6 : 1,
                    }}
                  >
                    {docLoading ? 'Generating…' : '📝 Generate README & Verify'}
                  </button>
                </div>
              </div>

              {/* Preset Sample Questions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  'How is authentication implemented?',
                  'Where is GitHub repository access handled?',
                  'How are architecture diagrams generated?',
                  'What happens when I click Analyze Repository?',
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setQuestionInput(preset);
                      handleAskQuestion(preset);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 100,
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)',
                      color: '#bbb',
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    💡 &quot;{preset}&quot;
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="fi"
                  type="text"
                  placeholder="Ask a question about this repository's codebase…"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                  style={{ flex: 1 }}
                />
                <button
                  disabled={qaLoading}
                  onClick={() => handleAskQuestion()}
                  style={{
                    padding: '0 24px',
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 800,
                    background: '#ff2d78',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: qaLoading ? 0.6 : 1,
                  }}
                >
                  {qaLoading ? 'Investigating…' : 'Ask Agent →'}
                </button>
              </div>

              {qaError && <p style={{ color: '#ff7070', fontSize: 13, fontWeight: 600, marginTop: 12 }}>⚠ {qaError}</p>}

              {/* Q&A Result Box */}
              {qaResponse && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Agentic Grounded Answer</h3>
                    {qaResponse.toolsUsed && qaResponse.toolsUsed.length > 0 && (
                      <span style={{ fontSize: 11, color: '#ff2d78', fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'rgba(255,45,120,0.1)', border: '1px solid rgba(255,45,120,0.25)' }}>
                        🔍 Analyzed codebase using {qaResponse.totalToolCalls || qaResponse.toolsUsed.length} tool(s): {qaResponse.toolsUsed.join(', ')}
                      </span>
                    )}
                  </div>

                  <div style={{ padding: '16px 20px', borderRadius: 14, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 14, lineHeight: 1.6, color: '#eee', whiteSpace: 'pre-wrap' }}>
                    {qaResponse.answer}
                  </div>

                  {qaResponse.sources && qaResponse.sources.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 6 }}>SOURCE CITATIONS:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {qaResponse.sources.map((s, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '4px 10px',
                              borderRadius: 8,
                              background: 'rgba(77,255,145,0.1)',
                              color: '#4dff91',
                              border: '1px solid rgba(77,255,145,0.2)',
                              fontFamily: 'monospace',
                            }}
                          >
                            📄 {s.filePath}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Active Analysis Result Box */}
          {activeAnalysis && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: '24px',
                borderRadius: 20,
                background: 'rgba(255,45,120,0.05)',
                border: '1px solid rgba(255,45,120,0.3)',
                marginBottom: 32,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Analysis Status</h2>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>ID: {activeAnalysis.id}</p>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '6px 16px',
                    borderRadius: 100,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    background:
                      activeAnalysis.status === 'completed'
                        ? 'rgba(45,255,120,0.15)'
                        : activeAnalysis.status === 'failed'
                        ? 'rgba(255,45,45,0.15)'
                        : 'rgba(255,180,45,0.15)',
                    color:
                      activeAnalysis.status === 'completed'
                        ? '#4dff91'
                        : activeAnalysis.status === 'failed'
                        ? '#ff7070'
                        : '#ffc84d',
                    border: '1px solid currentColor',
                  }}
                >
                  {activeAnalysis.status}
                </span>
              </div>

              {activeAnalysis.status === 'running' || activeAnalysis.status === 'queued' ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#aaa' }}>
                  <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#ff2d78', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 14, fontWeight: 600 }}>Analyzing &amp; indexing repository for RAG Q&amp;A…</p>
                </div>
              ) : null}

              {activeAnalysis.status === 'failed' && (
                <p style={{ color: '#ff7070', fontSize: 14, fontWeight: 600 }}>
                  Error: {activeAnalysis.error_message || 'Analysis failed.'}
                </p>
              )}

              {activeAnalysis.status === 'completed' && activeAnalysis.architecture_data && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>COMMIT SHA</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#ff2d78', fontFamily: 'monospace', marginTop: 4 }}>
                        {(activeAnalysis.commit_sha || 'head').substring(0, 7)}
                      </p>
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>FILES ANALYZED</p>
                      <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                        {activeAnalysis.architecture_data.metadata?.supportedFilesCount || 0}
                      </p>
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>MODULES DETECTED</p>
                      <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                        {activeAnalysis.architecture_data.modules?.length || 0}
                      </p>
                    </div>
                  </div>

                  {activeAnalysis.mermaid_diagram && (
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Generated Mermaid Dependency Graph</h3>
                      <pre
                        style={{
                          padding: '16px',
                          borderRadius: 14,
                          background: 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontSize: 12,
                          color: '#4dff91',
                          overflowX: 'auto',
                          fontFamily: 'monospace',
                        }}
                      >
                        {activeAnalysis.mermaid_diagram}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Tabs — shown when authenticated */}
          {status === 'authenticated' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
              {(['connected', 'repos', 'url'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 11,
                    fontSize: 13,
                    fontWeight: 700,
                    border: 'none',
                    background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: tab === t ? '#fff' : '#666',
                    cursor: 'pointer',
                    transition: 'all .2s',
                  }}
                >
                  {t === 'connected' ? `🔗 Connected Repos (${connectedRepos.length})` : t === 'repos' ? '📁 Available Repos' : '🔗 Paste URL'}
                </button>
              ))}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* Connected Repos Tab */}
            {tab === 'connected' && status === 'authenticated' && (
              <motion.div key="connected-tab" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {connectedRepos.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#666' }}>
                    <p style={{ fontSize: 15, fontWeight: 600 }}>No connected repositories yet.</p>
                    <p style={{ fontSize: 13, marginTop: 6, color: '#444' }}>Pick a repository from &quot;Available Repos&quot; to connect.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {connectedRepos.map((repo) => {
                      const isAnalyzingThis = analyzingRepoId === repo.id;
                      const isSyncingThis = syncingRepoId === repo.id;
                      const isSelectedForQa = selectedRepoForQa?.id === repo.id;
                      const latestSync = latestSyncJobs[repo.id];

                      return (
                        <div
                          key={repo.id}
                          style={{
                            padding: '20px 24px',
                            borderRadius: 16,
                            background: isSelectedForQa ? 'rgba(255,45,120,0.06)' : 'rgba(255,255,255,0.04)',
                            border: isSelectedForQa ? '1px solid rgba(255,45,120,0.4)' : '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                            <div>
                              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{repo.full_name}</h3>
                              <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                                Branch: <code style={{ color: '#ff2d78' }}>{repo.default_branch}</code> | Last Analyzed:{' '}
                                {repo.last_analyzed_at ? new Date(repo.last_analyzed_at).toLocaleDateString() : 'Never'}
                              </p>
                            </div>

                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                onClick={() => setSelectedRepoForQa(repo)}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 12,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: isSelectedForQa ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                                  color: isSelectedForQa ? '#ff2d78' : '#aaa',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  cursor: 'pointer',
                                }}
                              >
                                {isSelectedForQa ? '💬 Q&A Active' : 'Select for Q&A'}
                              </button>

                              <button
                                disabled={isSyncingThis}
                                onClick={() => handleManualSync(repo.id)}
                                style={{
                                  padding: '8px 14px',
                                  borderRadius: 12,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: 'rgba(255,255,255,0.08)',
                                  color: '#fff',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  cursor: 'pointer',
                                  opacity: isSyncingThis ? 0.6 : 1,
                                }}
                              >
                                {isSyncingThis ? 'Syncing…' : '🔄 Sync Now'}
                              </button>

                              <button
                                disabled={isAnalyzingThis}
                                onClick={() => handleStartAnalysis(repo.id)}
                                style={{
                                  padding: '8px 18px',
                                  borderRadius: 12,
                                  fontSize: 13,
                                  fontWeight: 800,
                                  background: '#ff2d78',
                                  color: '#fff',
                                  border: 'none',
                                  cursor: 'pointer',
                                  opacity: isAnalyzingThis ? 0.6 : 1,
                                }}
                              >
                                {isAnalyzingThis ? 'Starting…' : 'Analyze Repo'}
                              </button>
                            </div>
                          </div>

                          {/* Phase 4A Auto-Sync Controls & Status */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingTop: 12,
                              borderTop: '1px solid rgba(255,255,255,0.06)',
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ color: '#aaa', fontWeight: 600 }}>Auto-Sync:</span>
                              <button
                                onClick={() => handleToggleAutoSync(repo.id, repo.auto_sync_enabled)}
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: 100,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: repo.auto_sync_enabled ? 'rgba(45,255,120,0.15)' : 'rgba(255,255,255,0.05)',
                                  color: repo.auto_sync_enabled ? '#4dff91' : '#666',
                                  border: `1px solid ${repo.auto_sync_enabled ? 'rgba(45,255,120,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                  cursor: 'pointer',
                                }}
                              >
                                {repo.auto_sync_enabled ? 'ON (Webhook Active)' : 'OFF'}
                              </button>
                            </div>

                            {latestSync && (
                              <div style={{ color: '#888', fontWeight: 500 }}>
                                Latest Sync: <span style={{ color: latestSync.status === 'completed' ? '#4dff91' : '#ffc84d', fontWeight: 700 }}>{latestSync.status}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* Repos Tab */}
            {tab === 'repos' && status === 'authenticated' && (
              <motion.div key="repos-tab" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ marginBottom: 16 }}>
                  <input className="fi" type="text" placeholder="Search your repositories…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>

                {reposLoading && (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#555' }}>
                    <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#ff2d78', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Loading your repositories…</p>
                  </div>
                )}

                {!reposLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
                    {filteredRepos.length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#555', fontSize: 14, padding: '32px 0', fontWeight: 600 }}>No repositories found.</p>
                    ) : (
                      filteredRepos.map((repo) => {
                        const isConnected = connectedRepos.some((r) => r.github_repo_id === repo.id || r.full_name === repo.full_name);
                        const isConnecting = connectingFullName === repo.full_name;

                        return (
                          <div
                            key={repo.id}
                            style={{
                              width: '100%',
                              padding: '18px 20px',
                              borderRadius: 16,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 16,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {repo.full_name}
                                </span>
                                {repo.private && (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    private
                                  </span>
                                )}
                              </div>
                              {repo.description && (
                                <p style={{ fontSize: 12, color: '#666', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '440px' }}>
                                  {repo.description}
                                </p>
                              )}
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              {isConnected ? (
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#4dff91', padding: '6px 14px', borderRadius: 100, background: 'rgba(45,255,120,0.1)' }}>
                                  Connected
                                </span>
                              ) : (
                                <button
                                  disabled={isConnecting}
                                  onClick={() => handleConnectRepo(repo.full_name)}
                                  style={{
                                    padding: '8px 18px',
                                    borderRadius: 12,
                                    fontSize: 13,
                                    fontWeight: 800,
                                    background: '#ff2d78',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    opacity: isConnecting ? 0.6 : 1,
                                  }}
                                >
                                  {isConnecting ? 'Connecting…' : 'Connect Repo'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* URL Tab */}
            {tab === 'url' && (
              <motion.div key="url-tab" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ padding: '28px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Enter a GitHub repository URL</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      className="fi"
                      type="text"
                      placeholder="https://github.com/owner/repository"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setUrlError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={handleUrlSubmit}
                      style={{
                        padding: '0 28px',
                        borderRadius: 14,
                        fontSize: 14,
                        fontWeight: 800,
                        background: '#fff',
                        color: '#000',
                        border: 'none',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      Connect →
                    </button>
                  </div>
                  <AnimatePresence>
                    {urlError && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontSize: 13, color: '#ff8080', fontWeight: 600, marginTop: 10 }}>
                        ⚠ {urlError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}