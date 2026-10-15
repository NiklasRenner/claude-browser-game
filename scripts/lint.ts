/**
 * Project lint, built on the TypeScript compiler (no extra dependencies):
 *
 *   1. Type errors plus unused locals, parameters and imports (tsconfig flags).
 *   2. Dead exports: anything exported from src/ that nothing imports.
 *      Exports used only by tests are listed separately (usually fine, but
 *      worth a look).
 *   3. Layering: src/core must not import from render/ui/game, and nothing
 *      in src/core may touch the DOM or Math.random (see CLAUDE.md);
 *      src/ui and src/render must not import each other.
 *
 *   npm run lint
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'tsconfig.json');
const config = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
const options: ts.CompilerOptions = config.options;
const files = config.fileNames;
const rel = (f: string) => path.relative(root, f).replaceAll('\\', '/');
let problems = 0;
const report = (msg: string) => { problems++; console.log(`  ${msg}`); };

// ─── 1. Compiler diagnostics with unused checks ────────────────────────────
const program = ts.createProgram(files, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log('Compiler');
for (const d of diagnostics) {
  const where = d.file && d.start !== undefined
    ? `${rel(d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}` : '';
  report(`${where} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}

// ─── 2. Dead exports ───────────────────────────────────────────────────────
const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => files,
  getScriptVersion: () => '1',
  getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8')) : undefined),
  getCurrentDirectory: () => root,
  getCompilationSettings: () => options,
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
};
const service = ts.createLanguageService(host);
const isBarrel = (f: string) => /\/index\.ts$/.test(f);
const usedBy = { tests: [] as string[], none: [] as string[] };

for (const file of files.filter((f) => rel(f).startsWith('src/') && !isBarrel(f))) {
  const source = service.getProgram()!.getSourceFile(file)!;
  const check = (name: ts.Identifier, isType = false) => {
    const refs = service.findReferences(file, name.getStart()) ?? [];
    const users = refs.flatMap((r) => r.references)
      .filter((r) => r.fileName !== file && !isBarrel(r.fileName) && !r.isDefinition)
      .map((r) => rel(r.fileName));
    const label = `${rel(file)}: ${name.text}`;
    if (users.length === 0) {
      // Still fine if it's used inside its own file; then it just needn't be exported.
      const local = refs.flatMap((r) => r.references).filter((r) => r.fileName === file && !r.isDefinition).length;
      // An exported type used only locally usually describes a public signature; keep it.
      if (local && isType) return;
      usedBy.none.push(local ? `${label} (only used in its own file — drop \`export\`)` : `${label} (unused)`);
    } else if (users.every((u) => u.startsWith('tests/'))) {
      usedBy.tests.push(label);
    }
  };
  for (const stmt of source.statements) {
    const exported = ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) check(d.name);
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) {
      check(stmt.name);
    } else if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      check(stmt.name, true);
    }
  }
}
console.log('Dead exports');
for (const line of usedBy.none) report(line);
if (usedBy.tests.length) {
  console.log('Exported only for tests (fine, listed for information)');
  for (const line of usedBy.tests) console.log(`  · ${line}`);
}

// ─── 3. Layering rules ─────────────────────────────────────────────────────
console.log('Layering');
for (const file of files.filter((f) => rel(f).startsWith('src/core/'))) {
  const text = readFileSync(file, 'utf8');
  if (/from '\.\.\/(\.\.\/)?(render|ui|game)\b/.test(text)) report(`${rel(file)} imports from outside src/core`);
  if (/Math\.random\(/.test(text)) report(`${rel(file)} uses Math.random (use the seeded Rng)`);
  if (/\b(document|window|localStorage)\./.test(text)) report(`${rel(file)} touches the DOM`);
}

// The UI and the 3D stage don't know about each other; both only read core state and events.
for (const file of files.filter((f) => /src\/(ui|render)\//.test(rel(f)))) {
  const other = rel(file).startsWith('src/ui/') ? 'render' : 'ui';
  if (new RegExp(`from '(\\.\\./)+${other}/`).test(readFileSync(file, 'utf8'))) report(`${rel(file)} imports from src/${other}`);
}

console.log(problems ? `\n${problems} problem(s)` : '\nNo problems.');
process.exit(problems ? 1 : 0);
