/**
 * Project lint, built on the TypeScript compiler (no extra dependencies):
 *
 *   1. Type errors plus unused locals, parameters and imports (tsconfig flags).
 *   2. Dead exports: anything exported from src/ that nothing imports.
 *      Exports used only by tests are listed separately (usually fine, but
 *      worth a look).
 *   3. Unused public class members (TypeScript only checks private ones).
 *   4. Layering: who may import whom (LAYERS below, from the real import
 *      graph), and nothing in src/core may touch the DOM, the clock or
 *      Math.random (see CLAUDE.md).
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

// ─── 3. Unused class members ───────────────────────────────────────────────
// TypeScript reports unused private members; public ones nobody calls are dead code too.
console.log('Unused class members');
for (const file of files.filter((f) => rel(f).startsWith('src/'))) {
  const source = service.getProgram()!.getSourceFile(file)!;
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      for (const m of node.members) {
        if (ts.isConstructorDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) continue;
        if (ts.canHaveModifiers(m) && ts.getModifiers(m)?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword)) continue;
        const refs = (service.findReferences(file, m.name.getStart()) ?? []).flatMap((r) => r.references).filter((r) => !r.isDefinition);
        if (refs.length === 0) report(`${rel(file)}: ${node.name?.text ?? 'class'}.${m.name.text} is never used`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// ─── 4. Layering rules ─────────────────────────────────────────────────────
// Who may import whom (the first matching row wins; paths without extension). See CLAUDE.md and README.md.
const LAYERS: [string, string[]][] = [
  ['src/core/types', []],
  ['src/core/stats', ['src/core/types']],
  ['src/core/data/', ['src/core/data/', 'src/core/types', 'src/core/stats']],
  // Combat rules are the reducer's building blocks: they don't know about missions, saves or the bot.
  ['src/core/combat/', ['src/core/combat/', 'src/core/data', 'src/core/types', 'src/core/stats', 'src/core/player', 'src/core/rng']],
  ['src/core/', ['src/core/']],
  ['src/game/', ['src/core', 'src/game/']],
  // The UI and the stage don't know about each other; both read core state and events (and shared colours).
  ['src/render/', ['src/core', 'src/render/', 'src/game/elements']],
  ['src/ui/', ['src/core', 'src/ui/', 'src/game/']],
  ['src/editor/', ['src/core', 'src/render/', 'src/editor/']],
];
const under = (f: string, p: string) => (p.endsWith('/') ? f.startsWith(p) : f === p || f.startsWith(`${p}/`));
const moduleSpecifiers = (source: ts.SourceFile) => {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0]!)) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
};

console.log('Layering');
for (const file of files.filter((f) => rel(f).startsWith('src/'))) {
  const me = rel(file).replace(/\.ts$/, '');
  const allowed = LAYERS.find(([p]) => under(me, p))?.[1];
  const source = program.getSourceFile(file)!;
  if (allowed) {
    for (const spec of moduleSpecifiers(source)) {
      if (!spec.startsWith('.')) continue;
      const resolved = ts.resolveModuleName(spec, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) continue;
      const target = rel(resolved).replace(/(\/index)?\.(ts|json)$/, '');
      if (target !== me && !allowed.some((p) => under(target, p) || under(rel(resolved), p))) report(`${rel(file)} imports ${spec} (${me.split('/').slice(0, 3).join('/')} may only use ${allowed.join(', ') || 'nothing'})`);
    }
  }
  if (me.startsWith('src/core/')) {
    const text = source.text;
    const banned: [RegExp, string][] = [
      [/Math\.random\(/, 'uses Math.random (use the seeded Rng)'],
      [/\b(Date|performance|crypto)\b\s*[.(]|new Date\b/, 'reads the clock or crypto (core must be deterministic)'],
      [/\b(document|window|localStorage|sessionStorage)\./, 'touches the DOM'],
    ];
    for (const [re, msg] of banned) if (re.test(text)) report(`${rel(file)} ${msg}`);
  }
}

console.log(problems ? `\n${problems} problem(s)` : '\nNo problems.');
process.exit(problems ? 1 : 0);
