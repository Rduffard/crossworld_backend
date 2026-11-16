const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the parser already installed for backend linting.
const { parse } = createRequire(require.resolve('eslint'))('espree');
const root = path.resolve(process.argv[2] ?? path.join(__dirname, '../src/modules/archipelago'));
const jsx = process.argv.includes('--jsx');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const files = fs.readdirSync(root, { recursive: true })
  .filter(file => /\.(?:js|cjs|mjs)$/.test(file) || (jsx && file.endsWith('.jsx'))).sort();
const edges = [];

function walk(node, insideFunction, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, insideFunction);
  const nested = insideFunction || /^(?:ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(node.type);
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const entry of child) walk(entry, nested, visit);
    } else {
      walk(child, nested, visit);
    }
  }
}

for (const name of files) {
  const file = path.join(root, name);
  const ast = parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest', sourceType: jsx || name.endsWith('.mjs') ? 'module' : 'script',
    ecmaFeatures: { jsx }, loc: true,
  });
  walk(ast, false, (node, insideFunction) => {
    const specifier = node.type === 'CallExpression' && node.callee.name === 'require'
      ? node.arguments[0]?.value
      : node.source?.value;
    if (typeof specifier !== 'string' || !specifier.startsWith('.')) return;
    const base = path.resolve(path.dirname(file), specifier);
    const candidates = [base, base + '.js', base + '.cjs', base + '.mjs', base + '.json', path.join(base, 'index.js')];
    if (jsx) candidates.push(base + '.jsx', path.join(base, 'index.jsx'));
    const target = candidates
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!target || relative(target).startsWith('../')) return;
    edges.push({ from: relative(file), to: relative(target), line: node.loc.start.line, insideFunction });
  });
}

const vertices = [...new Set([...files.map(file => relative(path.join(root, file))), ...edges.map(edge => edge.to)])];
function components(includeFunctionImports) {
  const adjacency = new Map(vertices.map(vertex => [vertex, []]));
  for (const edge of edges) {
    if (includeFunctionImports || !edge.insideFunction) adjacency.get(edge.from).push(edge.to);
  }

  // Mutual reachability defines a strongly connected component.
  const reachable = new Map(vertices.map(vertex => {
    const visited = new Set([vertex]);
    for (const next of visited) for (const target of adjacency.get(next)) visited.add(target);
    return [vertex, visited];
  }));
  const remaining = new Set(vertices);
  const cycles = [];
  for (const vertex of remaining) {
    const group = [...reachable.get(vertex)].filter(target => reachable.get(target).has(vertex)).sort();
    for (const target of group) remaining.delete(target);
    if (group.length > 1 || adjacency.get(vertex).includes(vertex)) cycles.push(group);
  }
  return cycles.sort((a, b) => b.length - a.length);
}

console.log(JSON.stringify({
  all: components(true),
  moduleScope: components(false),
  edges,
}, null, 2));
