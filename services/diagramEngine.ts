import { ArchitectureModel } from './architectureEngine';

// Generates a clean, valid Mermaid flowchart as a fallback when LLM fails.
// Uses the full 10-layer ArchitectureModel so every detected tech appears.
export function generateMermaidDiagram(arch: ArchitectureModel): string {
  const lines: string[] = ['flowchart TD'];

  // ── Helper: safe node ID ──────────────────────────────────────────
  const id = (label: string) =>
    label.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20);

  // ── Collect non-null layers ───────────────────────────────────────
  interface Layer { key: string; label: string; value: string; color: string; }
  const layers: Layer[] = [
    { key: 'frontend',   label: 'Frontend',    value: arch.frontend   ?? '', color: 'client'  },
    { key: 'auth',       label: 'Auth',         value: arch.auth       ?? '', color: 'auth'    },
    { key: 'backend',    label: 'Backend',      value: arch.backend    ?? '', color: 'service' },
    { key: 'messaging',  label: 'Messaging',    value: arch.messaging  ?? '', color: 'service' },
    { key: 'database',   label: 'Database',     value: arch.database   ?? '', color: 'data'    },
    { key: 'caching',    label: 'Cache',        value: arch.caching    ?? '', color: 'data'    },
    { key: 'storage',    label: 'Storage',      value: arch.storage    ?? '', color: 'data'    },
    { key: 'devops',     label: 'DevOps',       value: arch.devops     ?? '', color: 'infra'   },
    { key: 'testing',    label: 'Testing',      value: arch.testing    ?? '', color: 'infra'   },
    { key: 'monitoring', label: 'Monitoring',   value: arch.monitoring ?? '', color: 'infra'   },
  ].filter(l => l.value.trim().length > 0);

  if (layers.length === 0) {
    return `flowchart TD\n  APP["Application"]\n  DB["Database"]\n  APP -->|"Query"| DB`;
  }

  // ── Group into subgraphs ──────────────────────────────────────────
  const groups: Record<string, Layer[]> = {
    client:  layers.filter(l => l.color === 'client'),
    auth:    layers.filter(l => l.color === 'auth'),
    service: layers.filter(l => l.color === 'service'),
    data:    layers.filter(l => l.color === 'data'),
    infra:   layers.filter(l => l.color === 'infra'),
  };

  const groupMeta: Record<string, { label: string; classColor: string }> = {
    client:  { label: 'Client Layer',      classColor: '#1a0a12' },
    auth:    { label: 'Auth Layer',        classColor: '#0a1a1a' },
    service: { label: 'Application Layer', classColor: '#0a0a1a' },
    data:    { label: 'Data Layer',        classColor: '#0a1a0a' },
    infra:   { label: 'Infrastructure',    classColor: '#1a1a0a' },
  };

  const nodeIds: Record<string, string> = {};
  const subgraphOrder = ['client','auth','service','data','infra'];

  // ── Emit subgraphs ────────────────────────────────────────────────
  subgraphOrder.forEach(group => {
    const groupLayers = groups[group];
    if (groupLayers.length === 0) return;

    const sgId = `SG_${group.toUpperCase()}`;
    lines.push(`  subgraph ${sgId}["${groupMeta[group].label}"]`);

    groupLayers.forEach(layer => {
      // Each tech in the value gets its own node
      const techs = layer.value.split(',').map(t => t.trim()).filter(Boolean);
      techs.forEach(tech => {
        const nodeId = id(tech);
        nodeIds[layer.key + '_' + tech] = nodeId;
        lines.push(`    ${nodeId}["${tech}"]`);
      });
    });

    lines.push('  end');
  });

  // ── Emit arrows (layer → layer) ───────────────────────────────────
  const getFirstNodeId = (key: string): string | null => {
    const entry = Object.entries(nodeIds).find(([k]) => k.startsWith(key + '_'));
    return entry ? entry[1] : null;
  };

  const addArrow = (fromKey: string, toKey: string, label: string) => {
    const from = getFirstNodeId(fromKey);
    const to   = getFirstNodeId(toKey);
    if (from && to) lines.push(`  ${from} -->|"${label}"| ${to}`);
  };

  if (arch.frontend && arch.auth)     addArrow('frontend', 'auth',     'Authenticate');
  if (arch.frontend && arch.backend)  addArrow('frontend', 'backend',  'API Request');
  if (arch.auth     && arch.backend)  addArrow('auth',     'backend',  'Token');
  if (arch.backend  && arch.database) addArrow('backend',  'database', 'Query');
  if (arch.backend  && arch.caching)  addArrow('backend',  'caching',  'Cache');
  if (arch.backend  && arch.messaging)addArrow('backend',  'messaging','Publish');
  if (arch.backend  && arch.storage)  addArrow('backend',  'storage',  'Upload');
  if (arch.devops   && arch.backend)  addArrow('devops',   'backend',  'Deploy');
  if (arch.monitoring && arch.backend)addArrow('backend',  'monitoring','Metrics');

  // ── classDef at bottom ────────────────────────────────────────────
  lines.push('  classDef client  fill:#1a0814,stroke:#ff2d78,color:#fff');
  lines.push('  classDef auth    fill:#0a1a18,stroke:#00d4aa,color:#fff');
  lines.push('  classDef service fill:#0a0d1a,stroke:#4d9eff,color:#fff');
  lines.push('  classDef data    fill:#0a1a0a,stroke:#00cc66,color:#fff');
  lines.push('  classDef infra   fill:#1a1a0a,stroke:#ffaa00,color:#fff');

  // ── class assignments ─────────────────────────────────────────────
  subgraphOrder.forEach(group => {
    const groupLayers = groups[group];
    if (groupLayers.length === 0) return;
    const ids = groupLayers
      .flatMap(layer =>
        layer.value.split(',').map(t => id(t.trim())).filter(Boolean)
      )
      .join(',');
    if (ids) lines.push(`  class ${ids} ${group}`);
  });

  return lines.join('\n');
}