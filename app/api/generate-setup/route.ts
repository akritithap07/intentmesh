import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Install command rules per tech ────────────────────────────────
function getInstallHint(techStack: string[]): string {
  const stack = techStack.map(t => t.toLowerCase());
  const hints: string[] = [];

  // Package manager
  if (stack.some(t => ['next.js','nextjs','react','vue','angular','svelte','nuxt','vite','remix','astro'].some(f => t.includes(f))))
    hints.push('npm install (or yarn / pnpm install)');
  if (stack.some(t => ['python','fastapi','django','flask','tornado'].some(f => t.includes(f))))
    hints.push('pip install -r requirements.txt');
  if (stack.some(t => t.includes('go') || t === 'gin' || t === 'echo' || t === 'fiber'))
    hints.push('go mod download');
  if (stack.some(t => t.includes('rust') || t === 'actix' || t === 'axum'))
    hints.push('cargo build');
  if (stack.some(t => t.includes('java') || t.includes('spring') || t === 'maven'))
    hints.push('mvn install');
  if (stack.some(t => t.includes('gradle')))
    hints.push('gradle build');
  if (stack.some(t => t.includes('docker')))
    hints.push('docker-compose up -d (or docker compose up -d)');

  // Run command
  if (stack.some(t => t.includes('next.js') || t.includes('nextjs')))
    hints.push('npm run dev → http://localhost:3000');
  else if (stack.some(t => t.includes('fastapi')))
    hints.push('uvicorn main:app --reload → http://localhost:8000');
  else if (stack.some(t => t.includes('django')))
    hints.push('python manage.py runserver → http://localhost:8000');
  else if (stack.some(t => t.includes('flask')))
    hints.push('flask run → http://localhost:5000');
  else if (stack.some(t => t.includes('spring')))
    hints.push('mvn spring-boot:run → http://localhost:8080');
  else if (stack.some(t => t === 'go' || t.includes('gin') || t.includes('echo')))
    hints.push('go run main.go → http://localhost:8080');
  else if (stack.some(t => t.includes('rust') || t === 'actix' || t === 'axum'))
    hints.push('cargo run → http://localhost:3000');

  return hints.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { projectName, projectType, features, techStack } = await request.json();

    const installHint = getInstallHint(Array.isArray(techStack) ? techStack : []);

    const prompt = `Generate realistic setup documentation for this project. Return ONLY valid JSON — no markdown, no backticks, no explanation.

Project: ${projectName}
Type: ${projectType || 'Web Application'}
Tech Stack: ${Array.isArray(techStack) ? techStack.join(', ') : techStack}
Features: ${Array.isArray(features) ? features.map((f: { name: string; description: string }) => f.name).join(', ') : ''}

Install approach hint: ${installHint || 'Standard web project'}

Return exactly this JSON structure:
{
  "prerequisites": "Short comma-separated list of what must be installed first. Include version numbers. E.g.: Node.js 18+, PostgreSQL 15+, Docker 24+",
  "installSteps": "Exact shell commands, one per line, to clone install and run. Include: git clone with placeholder URL, cd command, install command, cp .env.example .env.local, then the start command. Use the correct package manager for the stack.",
  "usageExample": "A realistic 4-6 step walkthrough of how someone uses this project after setup. Plain numbered steps. No code fences. E.g.: 1. Open http://localhost:3000 in your browser  2. Click Sign in with GitHub..."
}

Rules:
- installSteps must use the RIGHT package manager for the tech stack (npm for Node, pip for Python, go mod for Go, cargo for Rust, mvn for Java)
- prerequisites must be specific and real (not generic)
- usageExample must match the features: ${Array.isArray(features) ? features.slice(0, 3).map((f: { name: string }) => f.name).join(', ') : 'the project features'}
- Every string value must be on one line (use \\n for line breaks in installSteps)`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.2, // low temp = consistent JSON
      messages: [{ role: 'user', content: prompt }],
    });

    const raw     = completion.choices[0]?.message?.content ?? '{}';
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      data: {
        prerequisites: parsed.prerequisites ?? '',
        installSteps:  parsed.installSteps  ?? '',
        usageExample:  parsed.usageExample  ?? '',
      },
    });

  } catch (err) {
    console.error('[generate-setup]', err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}