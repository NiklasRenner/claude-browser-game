// layouts.json (src/render/scenes): written by the dev server when the scene editor saves.

/** One line per layer, so diffs stay readable. */
export function formatLayouts(all) {
  const one = (v) => Array.isArray(v) ? `[${v.map(one).join(', ')}]`
    : v && typeof v === 'object' ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${one(x)}`).join(', ')} }` : '{}')
    : JSON.stringify(v);
  const blocks = Object.entries(all).map(([id, l]) =>
    `  ${JSON.stringify(id)}: {\n    "layers": [\n${l.layers.map((x) => `      ${one(x)}`).join(',\n')}\n    ]\n  }`);
  return `{\n${blocks.join(',\n')}\n}\n`;
}

/** Whether a posted layout looks like one (the tests check it in depth). */
export const isLayout = (l) => Array.isArray(l?.layers) && l.layers.every((x) => typeof x?.part === 'string');
