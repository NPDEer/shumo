// Node's unit tests load @neilsustc/markdown-it-katex through require(), which
// binds katex/dist/katex.js. The ESM mhchem entry patches katex.mjs instead.
// Preload the CommonJS entry so both share one KaTeX. The packaged renderer
// aliases `katex` to katex.mjs and does not use this file.
require('katex/contrib/mhchem')
