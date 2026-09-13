import { ModuleAnalysis } from './ts-morph-analyzer';

export function sanitizeMermaidNodeId(path: string): string {
  return path.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function generateMermaidDiagram(modules: ModuleAnalysis[]): string {
  const lines: string[] = ['graph TD'];
  const createdNodes = new Set<string>();

  // Helper to declare a clean node
  const declareNode = (filePath: string) => {
    const nodeId = sanitizeMermaidNodeId(filePath);
    if (!createdNodes.has(nodeId)) {
      createdNodes.add(nodeId);
      const safeLabel = filePath.replace(/"/g, "'");
      lines.push(`    ${nodeId}["${safeLabel}"]`);
    }
    return nodeId;
  };

  // Declare all module nodes
  for (const mod of modules) {
    declareNode(mod.path);
  }

  // Create dependency edges
  const edgeSet = new Set<string>();

  for (const mod of modules) {
    const sourceNodeId = sanitizeMermaidNodeId(mod.path);

    for (const imp of mod.imports) {
      const spec = imp.moduleSpecifier;

      // Check if import resolves to an internal module
      let targetPath: string | null = null;

      if (spec.startsWith('./') || spec.startsWith('../')) {
        // Resolve relative import path roughly
        const parts = mod.path.split('/');
        parts.pop(); // remove filename
        const targetSpec = spec.replace(/^\.\//, '');
        targetPath = [...parts, targetSpec].join('/');
      } else if (spec.startsWith('@/')) {
        targetPath = spec.replace(/^@\//, '');
      }

      if (targetPath) {
        // Find matching module in codebase
        const matchedMod = modules.find(
          (m) =>
            m.path === targetPath ||
            m.path.startsWith(targetPath + '.') ||
            m.path.startsWith(targetPath + '/index.')
        );

        if (matchedMod) {
          const targetNodeId = sanitizeMermaidNodeId(matchedMod.path);
          if (sourceNodeId !== targetNodeId) {
            const edgeKey = `${sourceNodeId}-->${targetNodeId}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              lines.push(`    ${sourceNodeId} --> ${targetNodeId}`);
            }
          }
        }
      }
    }
  }

  return lines.join('\n');
}
