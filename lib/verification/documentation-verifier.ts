export interface VerificationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const SECRET_PATTERNS = [
  /AUTH_SECRET\s*=\s*['"]?[a-zA-Z0-9_\-\.\+]{8,}/i,
  /GROQ_API_KEY\s*=\s*['"]?gsk_[a-zA-Z0-9_]{20,}/i,
  /GITHUB_CLIENT_SECRET\s*=\s*['"]?[a-zA-Z0-9_]{20,}/i,
  /postgres:\/\/[^:\s]+:[^@\s]+@[^\s]+/i,
  /sk-[a-zA-Z0-9]{20,}/i,
  /ghp_[a-zA-Z0-9]{20,}/i,
];

export function verifyDocumentation(
  content: string,
  architectureModules: Array<{ path: string }> = []
): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Non-empty & size check
  if (!content || content.trim().length < 100) {
    errors.push('Documentation content is too short or empty (minimum 100 characters required).');
  }

  if (content.length > 200000) {
    errors.push('Documentation content is absurdly large (exceeds 200,000 character boundary).');
  }

  // 2. Secret safety check
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`Secret Leakage Detected: Documentation contains matching secret pattern ${pattern.source}`);
    }
  }

  // 3. Required markdown section headers check
  if (!content.includes('# ')) {
    errors.push('Missing top-level H1 header (e.g. # Project Name).');
  }

  const hasOverview = /##\s+(Overview|Project Overview|Introduction|About)/i.test(content);
  const hasArchitecture = /##\s+(Architecture|System Architecture|Structure|Modules)/i.test(content);
  if (!hasOverview && !hasArchitecture) {
    warnings.push('Recommended section header (## Overview or ## Architecture) missing.');
  }

  // 4. Mermaid block syntax check
  if (content.includes('```mermaid')) {
    const mermaidMatch = content.match(/```mermaid([\s\S]*?)```/);
    if (!mermaidMatch || !mermaidMatch[1].trim()) {
      errors.push('Mermaid diagram block is empty or malformed.');
    } else {
      const diagram = mermaidMatch[1];
      if (!diagram.includes('graph ') && !diagram.includes('flowchart ')) {
        warnings.push('Mermaid diagram does not specify graph/flowchart layout.');
      }
    }
  }

  // 5. Path verification: check for hallucinated file references
  if (architectureModules.length > 0) {
    const knownPaths = new Set(architectureModules.map((m) => m.path.toLowerCase()));
    // Extract file-like paths from markdown (e.g. `src/index.ts` or [text](lib/auth.ts))
    const pathMatches = content.match(/`([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`/g) || [];
    let hallucinatedCount = 0;

    for (const rawMatch of pathMatches) {
      const path = rawMatch.replace(/`/g, '').toLowerCase();
      // Only check paths that look like codebase relative paths
      if ((path.includes('/') || path.endsWith('.ts') || path.endsWith('.js')) && !path.startsWith('http')) {
        if (!knownPaths.has(path) && !knownPaths.has(path.replace(/^\//, ''))) {
          hallucinatedCount++;
        }
      }
    }

    if (hallucinatedCount > 5) {
      warnings.push(`Multiple suspicious file paths detected (${hallucinatedCount}) that do not exist in the codebase.`);
    }
  }

  const isValid = errors.length === 0;
  return { isValid, errors, warnings };
}
