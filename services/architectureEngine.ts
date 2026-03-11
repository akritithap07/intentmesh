export interface ArchitectureModel {
  frontend:   string | null;
  backend:    string | null;
  database:   string | null;
  caching:    string | null;
  devops:     string | null;
  auth:       string | null;
  messaging:  string | null;
  storage:    string | null;
  testing:    string | null;
  monitoring: string | null;
}

const FRONTEND_TECH  = ['react','next.js','nextjs','vue','vue.js','angular','svelte','sveltekit','nuxt','nuxt.js','remix','astro','vite','gatsby','react native','flutter','expo','tailwind','tailwind css','bootstrap','material ui','chakra ui','shadcn','shadcn/ui','framer motion','three.js','html','css','ionic','electron'];
const BACKEND_TECH   = ['node.js','nodejs','express','express.js','fastify','nestjs','hono','bun','python','fastapi','django','flask','tornado','java','spring','spring boot','quarkus','go','gin','echo','fiber','rust','actix','actix web','axum','ruby','rails','ruby on rails','sinatra','php','laravel','symfony','c#','.net','asp.net','trpc','graphql','grpc','deno','elixir','phoenix'];
const DATABASE_TECH  = ['postgresql','postgres','mysql','sqlite','mongodb','supabase','planetscale','cockroachdb','dynamodb','cassandra','elasticsearch','firebase','firestore','turso','neon','prisma','drizzle','drizzle orm','typeorm','mongoose','sqlalchemy','sequelize','fauna','convex','xata'];
const CACHING_TECH   = ['redis','memcached','upstash','varnish','cloudflare cache'];
const DEVOPS_TECH    = ['docker','docker compose','kubernetes','k8s','terraform','ansible','github actions','gitlab ci','circleci','jenkins','vercel','netlify','railway','render','fly.io','heroku','aws','aws lambda','aws ec2','gcp','google cloud run','azure','cloudflare','nginx','caddy'];
const AUTH_TECH      = ['nextauth','nextauth.js','auth.js','clerk','auth0','firebase auth','supabase auth','passport.js','jwt','oauth','lucia','kinde'];
const MESSAGING_TECH = ['websockets','socket.io','pusher','ably','kafka','rabbitmq','redis pub/sub','sqs','nats','livekit','twilio'];
const STORAGE_TECH   = ['aws s3','cloudflare r2','uploadthing','cloudinary','imagekit','supabase storage','firebase storage','backblaze'];
const TESTING_TECH   = ['jest','vitest','playwright','cypress','pytest','junit','testing library','mocha','chai','supertest'];
const MONITORING_TECH= ['sentry','datadog','prometheus','grafana','newrelic','logrocket','posthog','plausible','vercel analytics','opentelemetry','axiom'];

function matchFirst(stack: string[], candidates: string[]): string | null {
  for (const item of stack) {
    const lower = item.toLowerCase().trim();
    for (const c of candidates) {
      if (lower === c || lower.includes(c) || c.includes(lower)) return item;
    }
  }
  return null;
}

function matchMultiple(stack: string[], candidates: string[], limit = 3): string | null {
  const found: string[] = [];
  for (const item of stack) {
    const lower = item.toLowerCase().trim();
    for (const c of candidates) {
      if (lower === c || lower.includes(c) || c.includes(lower)) {
        if (!found.includes(item)) { found.push(item); break; }
      }
    }
    if (found.length >= limit) break;
  }
  return found.length > 0 ? found.join(', ') : null;
}

function inferFromLanguages(langs: Record<string, number>): Partial<ArchitectureModel> {
  const keys = Object.keys(langs).map(k => k.toLowerCase());
  const r: Partial<ArchitectureModel> = {};
  if (keys.includes('typescript') || keys.includes('javascript')) r.backend = 'Node.js';
  if (keys.includes('python'))  r.backend  = r.backend  ?? 'Python';
  if (keys.includes('go'))      r.backend  = r.backend  ?? 'Go';
  if (keys.includes('rust'))    r.backend  = r.backend  ?? 'Rust';
  if (keys.includes('java'))    r.backend  = r.backend  ?? 'Spring Boot';
  if (keys.includes('ruby'))    r.backend  = r.backend  ?? 'Ruby on Rails';
  if (keys.includes('php'))     r.backend  = r.backend  ?? 'Laravel';
  if (keys.includes('c#'))      r.backend  = r.backend  ?? 'ASP.NET Core';
  if (keys.includes('html') || keys.includes('css')) r.frontend = 'HTML/CSS';
  return r;
}

// userTechStack is a comma-separated string: "Next.js, PostgreSQL, Redis, Docker"
export function inferArchitecture(
  languages: Record<string, number>,
  topics: string[],
  userTechStack?: string
): ArchitectureModel {
  const userStack = userTechStack
    ? userTechStack.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const stack      = userStack.length > 0 ? userStack : Object.keys(languages);
  const allSources = [...stack, ...topics];
  const langFb     = inferFromLanguages(languages);

  return {
    frontend:   matchMultiple(allSources, FRONTEND_TECH, 3) ?? langFb.frontend   ?? null,
    backend:    matchMultiple(allSources, BACKEND_TECH,  3) ?? langFb.backend    ?? null,
    database:   matchMultiple(allSources, DATABASE_TECH, 2) ?? langFb.database   ?? null,
    caching:    matchFirst(allSources, CACHING_TECH)        ?? langFb.caching    ?? null,
    devops:     matchMultiple(allSources, DEVOPS_TECH,   3) ?? langFb.devops     ?? null,
    auth:       matchFirst(allSources, AUTH_TECH)           ?? null,
    messaging:  matchFirst(allSources, MESSAGING_TECH)      ?? null,
    storage:    matchFirst(allSources, STORAGE_TECH)        ?? null,
    testing:    matchFirst(allSources, TESTING_TECH)        ?? null,
    monitoring: matchFirst(allSources, MONITORING_TECH)     ?? null,
  };
}