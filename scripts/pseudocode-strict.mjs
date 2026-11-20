// pseudocode.js 2.4.1 assigns three variables it never declares in
// src/Renderer.js. That works in Node's sloppy-mode CommonJS, but the
// renderer bundle is a strict ES module, where each one throws a
// ReferenceError and the algorithm falls back to source. The build declares
// them where they are first assigned (see electron.vite.config.ts).

export const UNDECLARED = ['attrVal', 'ifCond', 'uponCond']

/** pseudocode.js's Renderer.js with its undeclared variables declared. */
export function declareUndeclared(code) {
  let fixed = code
  for (const name of UNDECLARED) {
    const assignment = new RegExp(`^(\\s*)${name} = `, 'm')
    if (!assignment.test(fixed)) {
      throw new Error(`pseudocode.js changed: no assignment to ${name}; review scripts/pseudocode-strict.mjs`)
    }
    fixed = fixed.replace(assignment, `$1var ${name} = `)
  }
  return fixed
}
