import { Project } from 'ts-morph';
import { FileContent } from '@/lib/github-ingest';

export interface ModuleAnalysis {
  path: string;
  imports: Array<{ moduleSpecifier: string; importedSymbols: string[] }>;
  exports: Array<{ name: string; kind: string }>;
  functions: string[];
  classes: string[];
  interfaces: string[];
  types: string[];
  internalDependencies: string[];
  externalDependencies: string[];
}

export interface ArchitectureData {
  metadata: {
    analyzedAt: string;
    totalFiles: number;
    supportedFilesCount: number;
    commitSha: string;
  };
  modules: ModuleAnalysis[];
  externalDependencies: string[];
}

export function analyzeCodebaseWithTsMorph(
  files: FileContent[],
  commitSha: string
): { architectureData: ArchitectureData; modulesMap: Map<string, ModuleAnalysis> } {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
    },
  });

  // Add source files to ts-morph project
  const sourceFiles = files.map((f) => project.createSourceFile(f.path, f.content));

  const modules: ModuleAnalysis[] = [];
  const allExternalDependencies = new Set<string>();
  const modulesMap = new Map<string, ModuleAnalysis>();

  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath().replace(/^\//, ''); // normalize path
    const imports: ModuleAnalysis['imports'] = [];
    const exports: ModuleAnalysis['exports'] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    const interfaces: string[] = [];
    const types: string[] = [];
    const internalDependencies: string[] = [];
    const externalDependencies: string[] = [];

    // 1. Analyze Imports
    for (const importDecl of sf.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const importedSymbols: string[] = [];

      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) importedSymbols.push(defaultImport.getText());

      for (const namedImport of importDecl.getNamedImports()) {
        importedSymbols.push(namedImport.getName());
      }

      imports.push({ moduleSpecifier, importedSymbols });

      if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('@/')) {
        internalDependencies.push(moduleSpecifier);
      } else {
        externalDependencies.push(moduleSpecifier);
        allExternalDependencies.add(moduleSpecifier);
      }
    }

    // 2. Analyze Functions
    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (name) {
        functions.push(name);
        if (fn.isExported()) {
          exports.push({ name, kind: 'function' });
        }
      }
    }

    // 3. Analyze Classes
    for (const cls of sf.getClasses()) {
      const name = cls.getName();
      if (name) {
        classes.push(name);
        if (cls.isExported()) {
          exports.push({ name, kind: 'class' });
        }
      }
    }

    // 4. Analyze Interfaces & Type Aliases
    for (const iface of sf.getInterfaces()) {
      const name = iface.getName();
      interfaces.push(name);
      if (iface.isExported()) {
        exports.push({ name, kind: 'interface' });
      }
    }

    for (const typeAlias of sf.getTypeAliases()) {
      const name = typeAlias.getName();
      types.push(name);
      if (typeAlias.isExported()) {
        exports.push({ name, kind: 'type' });
      }
    }

    // 5. Analyze Export Declarations (e.g. export const x = ...)
    for (const exportDecl of sf.getExportDeclarations()) {
      for (const spec of exportDecl.getNamedExports()) {
        exports.push({ name: spec.getName(), kind: 'variable' });
      }
    }

    const modAnalysis: ModuleAnalysis = {
      path: filePath,
      imports,
      exports,
      functions,
      classes,
      interfaces,
      types,
      internalDependencies,
      externalDependencies,
    };

    modules.push(modAnalysis);
    modulesMap.set(filePath, modAnalysis);
  }

  const architectureData: ArchitectureData = {
    metadata: {
      analyzedAt: new Date().toISOString(),
      totalFiles: files.length,
      supportedFilesCount: sourceFiles.length,
      commitSha,
    },
    modules,
    externalDependencies: Array.from(allExternalDependencies),
  };

  return { architectureData, modulesMap };
}
