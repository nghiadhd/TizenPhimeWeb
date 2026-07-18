// Injects ../userScript.js into the page's main world at document-start —
// mirrors how TizenBrew injects `main` into every page on the TV.
const fs = require('fs');
const path = require('path');
try {
  const code = fs.readFileSync(path.join(__dirname, '..', 'userScript.js'), 'utf8');
  window.eval(code);
} catch (e) {
  console.error('[TizenPhimWeb] inject failed', e);
}
