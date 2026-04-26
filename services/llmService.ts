import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── LLM call with timeout + 1 automatic retry ──────────────────────
//
// WHY: Groq (and any LLM API) can hang on serverless for 60–90 s.
// Next.js serverless functions default timeout is 10–30 s depending
// on plan, so we must abort ourselves and retry once before giving up.
async function callLLM(
  system: string,
  user: string,
  maxTokens = 8192,
  temp = 0.7,
  timeoutMs = 25_000,
): Promise<string> {
  const attempt = async (): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const completion = await groq.chat.completions.create(
        {
          model: 'llama-3.3-70b-versatile',
          max_tokens: maxTokens,
          temperature: temp,
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: user   },
          ],
        },
        { signal: controller.signal },
      );
      return completion.choices[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (firstErr) {
    // Retry once on timeout or transient network error
    const isRetryable =
      firstErr instanceof Error &&
      (firstErr.name === 'AbortError' ||
        firstErr.message.includes('fetch') ||
        firstErr.message.includes('network') ||
        firstErr.message.includes('timeout'));

    if (isRetryable) {
      console.warn('[llmService] Retrying LLM call after transient error:', firstErr.message);
      return await attempt(); // Let the second failure propagate naturally
    }

    throw firstErr;
  }
}

// ── Types ─────────────────────────────────────────────────────────
export interface UserAnswers {
  tagline:       string;
  whyBuilt:      string;
  projectType:   string;
  audience:      string;
  features:      { name: string; description: string }[];
  techStack:     string;          // comma-separated string
  prerequisites: string;
  installSteps:  string;
  envVars:       { name: string; description: string; required: boolean }[];
  usageExample:  string;
  demoUrl:       string;
  deployment:    string;
  license:       string;
  status:        string;
  limitations:   string;
  roadmap:       string;
  contributing:  boolean;
  diagramType:   string;          // flowchart | block | tier | usecase | sequence | er
}

// ── README ─────────────────────────────────────────────────────────
export async function generateReadme(params: {
  repoName:     string;
  description:  string;
  languages:    string[];
  topics:       string[];
  stars:        number;
  forks:        number;
  architecture: {
    frontend: string | null; backend: string | null; database: string | null;
    caching: string | null; devops: string | null; auth: string | null;
    messaging: string | null; storage: string | null; testing: string | null;
    monitoring: string | null;
  };
  contributors: { username: string; contributions: number }[];
  userAnswers?: UserAnswers;
}): Promise<string> {
  const ua = params.userAnswers;

  // Build feature list
  const featureBlock = ua?.features?.filter(f => f.name.trim()).map(f =>
    `- **${f.name}**: ${f.description}`
  ).join('\n') ?? '';

  // Build env vars table
  const envBlock = ua?.envVars?.filter(e => e.name.trim()).length
    ? `| Variable | Description | Required |\n|----------|-------------|----------|\n` +
      ua!.envVars.filter(e => e.name.trim()).map(e =>
        `| \`${e.name}\` | ${e.description} | ${e.required ? '✅ Yes' : '❌ No'} |`
      ).join('\n')
    : '';

  // Build roadmap list
  const roadmapBlock = ua?.roadmap
    ? ua.roadmap.split('\n').filter(l => l.trim()).map(l =>
        l.startsWith('-') ? l : `- ${l}`
      ).join('\n')
    : '';

  const system = `You are a senior technical writer who creates exceptional GitHub README files — the kind found in top open source projects like Next.js, Prisma, Vercel CLI, and shadcn/ui.

Your output must be raw Markdown only. No outer code fences. No meta-commentary.

MANDATORY SECTIONS IN THIS EXACT ORDER:

1. # {Project Name}
   - One line of badges: license, language, status, stars
   - If demo URL provided: add a "🔗 Live Demo" link right below badges

2. > **{tagline}**
   (in a Markdown blockquote — this is the first thing anyone reads)

3. ## Why {Project Name} Exists
   - 2-3 paragraphs explaining the problem and why this solution matters
   - Must feel personal and opinionated, not generic

4. ## ✨ Features
   - Each feature as: **Feature Name** — description (one paragraph per feature)
   - Minimum 4 features, each with enough detail to understand its value

5. ## 🏗️ Architecture
   - One paragraph overview of how the system is designed
   - Subsections for each detected layer (Frontend / Backend / Database / Auth / etc.)
   - Each subsection: bold the tech name, explain its role in the project

6. ## 📑 Table of Contents
   - Links to every section

7. ## 🚀 Quick Start
   - Prerequisites as a bullet list
   - Installation as a numbered list with EVERY command in a \`\`\`bash block
   - One command per \`\`\`bash block OR all commands in one block — be consistent

8. ## ⚙️ Configuration
   - If env vars provided: show the full table
   - Always show a \`\`\`bash block with: cp .env.example .env
   - Explain what each variable does

9. ## 📖 Usage
   - Show the actual usage example
   - Use numbered steps
   - Include any relevant \`\`\`bash or \`\`\`js code blocks

10. ## 🤝 Contributing (only if contributing: true)
    - Fork → Clone → Branch → PR workflow
    - Code style notes
    - PR template reminder

11. ## ⚠️ Known Limitations (only if limitations provided)

12. ## 🗺️ Roadmap (only if roadmap provided)
    - Checkbox list: - [ ] Item

13. ## 📄 License
    - One line stating the license and linking to LICENSE file

FORMATTING RULES (never violate these):
- Shell commands ALWAYS in \`\`\`bash blocks — never inline
- Config variables ALWAYS in a table — never a bullet list
- Section headers: use the exact emojis listed above
- Minimum 500 lines of content
- Don't pad with filler — every sentence must be informative
- Use real technology names from the provided stack — never say "your database" or "the framework"`;

  const user = `Generate the complete README for this project. Use EVERY piece of information below — do not skip any field.

═══════════════════════════════════════════
PROJECT IDENTITY
═══════════════════════════════════════════
Name:        ${params.repoName}
Tagline:     ${ua?.tagline || params.description || 'A software project'}
Type:        ${ua?.projectType || 'Software Project'}
Status:      ${ua?.status || 'In active development'}
License:     ${ua?.license || 'MIT'}
Demo URL:    ${ua?.demoUrl || 'Not provided'}
Stars:       ${params.stars} | Forks: ${params.forks}

═══════════════════════════════════════════
WHY IT EXISTS
═══════════════════════════════════════════
${ua?.whyBuilt || params.description || 'A project that solves real problems.'}

═══════════════════════════════════════════
TARGET AUDIENCE
═══════════════════════════════════════════
${ua?.audience || 'Developers'}

═══════════════════════════════════════════
KEY FEATURES (use ALL of these)
═══════════════════════════════════════════
${featureBlock || params.topics.map(t => `- ${t}`).join('\n') || 'No features specified — infer from tech stack'}

═══════════════════════════════════════════
TECH STACK
═══════════════════════════════════════════
User-specified:   ${ua?.techStack || 'Not specified'}
GitHub languages: ${params.languages.join(', ')}
Topics:           ${params.topics.join(', ')}
Frontend:         ${params.architecture.frontend ?? 'None detected'}
Backend:          ${params.architecture.backend  ?? 'None detected'}
Database:         ${params.architecture.database ?? 'None detected'}
Auth:             ${params.architecture.auth     ?? 'None detected'}
Caching:          ${params.architecture.caching  ?? 'None detected'}
Messaging:        ${params.architecture.messaging ?? 'None detected'}
Storage:          ${params.architecture.storage  ?? 'None detected'}
DevOps:           ${params.architecture.devops   ?? 'None detected'}
Testing:          ${params.architecture.testing  ?? 'None detected'}
Monitoring:       ${params.architecture.monitoring ?? 'None detected'}
Deployment:       ${ua?.deployment || 'Not specified'}

═══════════════════════════════════════════
SETUP
═══════════════════════════════════════════
Prerequisites:
${ua?.prerequisites || 'Node.js 18+'}

Installation commands:
${ua?.installSteps || 'npm install && npm run dev'}

Environment variables:
${envBlock || '(None provided — include a generic .env section based on the tech stack)'}

Usage example:
${ua?.usageExample || 'Not provided — infer from features and tech stack'}

═══════════════════════════════════════════
ADDITIONAL SECTIONS
═══════════════════════════════════════════
Known Limitations: ${ua?.limitations || 'None provided'}
Roadmap:
${roadmapBlock || 'None provided'}
Contributing section: ${ua?.contributing ? 'YES — include it' : 'NO — skip it'}
Top contributors: ${params.contributors.slice(0, 3).map(c => c.username).join(', ') || 'None'}

Now write the complete, professional README. Every section must be detailed and specific.
Output raw Markdown only — no outer fences, no preamble.`;

  return callLLM(system, user, 8192, 0.7);
}

// ── ARCHITECTURE DIAGRAM ──────────────────────────────────────────

type DiagramType = 'flowchart' | 'block';

const DIAGRAM_CONFIGS: Record<DiagramType, {
  label: string;
  firstLine: string;
  syntaxRules: string;
  structureGuide: string;
}> = {
  flowchart: {
    label: 'Flowchart',
    firstLine: 'flowchart TD',
    syntaxRules: `MERMAID SYNTAX — follow exactly or the diagram will not render:
- First line: flowchart TD
- Node IDs: UPPERCASE letters and underscores only (e.g. API_SERVER, JOB_MATCH)
- Node labels: always ["double quoted"] (e.g. API_SERVER["Express API"])
- Arrow labels: always double-quoted (e.g. A -->|"HTTP POST"| B)
- NEVER write |text|> — always use -->|"text"|
- Subgraph format (exact):
    subgraph SG_APP["Backend"]
      API_SERVER["Express API"]
    end
- classDef lines: ONLY after all nodes and arrows, never inside subgraphs
- class lines: ONLY at the very end, NO spaces after commas (e.g. class A,B,C myClass)
- Each node ID must be unique across the whole diagram`,
    structureGuide: `DIAGRAM STRUCTURE — use only what applies:
  SG_CLIENT → browsers, mobile apps, CLI
  SG_AUTH   → login, OAuth, JWT verification
  SG_APP    → main backend, APIs, workers
  SG_DATA   → databases, cache, queues
  SG_INFRA  → hosting, monitoring, CI/CD

FEATURE-FIRST RULES:
1. Every key feature gets its own dedicated node (e.g. JOB_MATCH["Job Matching Engine"])
2. Tech stack nodes SUPPORT the features — they are secondary
3. Arrow labels describe the action or data flowing (e.g. "job listings", "auth token")
4. Minimum 10 nodes total`,
  },

  block: {
    label: 'Block Diagram',
    firstLine: 'flowchart LR',
    syntaxRules: `MERMAID SYNTAX — follow exactly or the diagram will not render:
- First line: flowchart LR
- Node IDs: UPPERCASE letters and underscores only
- Node labels: always ["double quoted"]
- Arrow labels: always double-quoted (e.g. A -->|"uses"| B)
- NEVER write |text|> — always use -->|"text"|
- Subgraph format (exact):
    subgraph SG_FRONT["Frontend"]
      BROWSER["Web Browser"]
    end
- classDef and class lines ONLY at the very end of the file
- class lines: NO spaces after commas (e.g. class A,B myClass)`,
    structureGuide: `DIAGRAM STRUCTURE — 3 to 4 feature-area blocks left to right.
Each block is a subgraph. Each block has 2–4 nodes inside it.
Connect blocks with labeled arrows showing data or action flow.

FEATURE-FIRST RULES:
1. Name each block after a FEATURE AREA (e.g. "Job Matching", "User Onboarding")
2. Inside each block, place the components that power that feature
3. Tech stack nodes live INSIDE the relevant feature block — not standalone
4. Draw arrows to show how feature areas share data or trigger each other`,
  },
};

export async function generateAdvancedDiagram(params: {
  repoName:     string;
  languages:    string[];
  topics:       string[];
  architecture: {
    frontend: string | null; backend: string | null; database: string | null;
    caching: string | null; devops: string | null; auth: string | null;
    messaging: string | null; storage: string | null; testing: string | null;
    monitoring: string | null;
  };
  userAnswers?: UserAnswers;
}): Promise<string> {

  const rawType   = (params.userAnswers?.diagramType ?? 'flowchart') as DiagramType;
  const diagType  = DIAGRAM_CONFIGS[rawType] ? rawType : 'flowchart';
  const cfg       = DIAGRAM_CONFIGS[diagType];
  const techStack = params.userAnswers?.techStack || params.languages.slice(0, 8).join(', ');

  // Feature list — the most important input for the diagram
  const featureList = (params.userAnswers?.features as { name: string; description: string }[] | undefined)
    ?.filter(f => f.name.trim())
    .map(f => `  - ${f.name}: ${f.description}`)
    .join('\n') ?? '';

  const system = `You are a Mermaid.js expert. Your output goes directly into mermaid.render(). A single syntax error crashes everything.

Output ONLY raw Mermaid syntax. Zero markdown. Zero explanation. Zero fences.

${cfg.syntaxRules}

${cfg.structureGuide}`;

  const user = `Generate a ${cfg.label} diagram for: ${params.repoName}

KEY FEATURES — highest priority, each must appear as a named node:
${featureList || '(none provided — infer from project name, type, and tech stack)'}

TECH STACK — use to support the features above:
${techStack || params.languages.join(', ')}

DETECTED LAYERS:
Frontend:   ${params.architecture.frontend   ?? 'Not detected'}
Backend:    ${params.architecture.backend    ?? 'Not detected'}
Database:   ${params.architecture.database   ?? 'Not detected'}
Auth:       ${params.architecture.auth       ?? 'Not detected'}
Caching:    ${params.architecture.caching    ?? 'Not detected'}
Messaging:  ${params.architecture.messaging  ?? 'Not detected'}
Storage:    ${params.architecture.storage    ?? 'Not detected'}
DevOps:     ${params.architecture.devops     ?? 'Not detected'}
Monitoring: ${params.architecture.monitoring ?? 'Not detected'}
Deployment: ${params.userAnswers?.deployment ?? 'Not specified'}
Project Type: ${params.userAnswers?.projectType ?? 'Web Application'}

Output ONLY the Mermaid diagram. No fences. No explanation. First line must be exactly: ${cfg.firstLine}`;

  return callLLM(system, user, 2048, 0.2); // low temp = consistent syntax
}

// ── CONTRIBUTOR OUTREACH ──────────────────────────────────────────
export async function generateContributorOutreach(params: {
  repoName:     string;
  description:  string;
  languages:    string[];
  topics:       string[];
  architecture: { frontend: string | null; backend: string | null; database: string | null };
  potentialContributors: {
    username: string; bio: string | null;
    publicRepos: number; followers: number; location: string | null;
  }[];
  userAnswers?: UserAnswers;
}): Promise<{ username: string; subject: string; body: string }[]> {
  if (params.potentialContributors.length === 0) return [];

  const projectDesc = params.userAnswers?.tagline || params.description || params.repoName;
  const stack = params.userAnswers?.techStack || params.languages.join(', ');

  const system = `You write short, warm, personalized outreach emails to open source contributors.

Each email must:
1. Start with: "Hi @{username},"
2. Reference something specific from their bio
3. Describe the project in 1-2 sentences using the tagline
4. Explain why THIS person specifically would be valuable (match their background to the stack)
5. Name one specific contribution area they could help with
6. End with a low-pressure CTA: "Would love to have you take a look at the repo if you're interested!"
7. Sign off as: "— The ${params.repoName} Team"
8. Length: 120-180 words — personal, not corporate

Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
Format exactly: [{"username":"...","subject":"...","body":"..."}]`;

  const user = `Write personalized contributor outreach emails for: ${params.repoName}

Project tagline: ${projectDesc}
Tech stack: ${stack}
Project type: ${params.userAnswers?.projectType || 'Software project'}

Contributors to email:
${params.potentialContributors.map((c, i) =>
  `${i + 1}. @${c.username} | Bio: "${c.bio ?? 'None'}" | Repos: ${c.publicRepos} | Followers: ${c.followers} | Location: ${c.location ?? 'Unknown'}`
).join('\n')}

Return ONLY the JSON array: [{"username":"...","subject":"...","body":"..."}]`;

  const raw = await callLLM(system, user, 4096, 0.8);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('[llmService] Failed to parse contributor outreach JSON. Raw output:', raw.slice(0, 200));
    return [];
  }
}