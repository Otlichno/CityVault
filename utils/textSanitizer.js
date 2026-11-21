const escapeHtml = require('escape-html');

// Game text (bios, names) as HTML: the game's escape codes decoded, then
// everything escaped, then its \n line breaks as <br>. The result is safe to
// print unescaped (<%- %>).
function stringClean(input) {
  if (!input || typeof input !== 'string') return '';

  // CoH escape codes: \s ' , \d $ , \p % , \q "
  const decoded = input.replace(/\\s/g, "'")
                       .replace(/\\d/g, '$')
                       .replace(/\\p/g, '%')
                       .replace(/\\q/g, '"');

  // Escape for HTML (this used to be computed and then discarded).
  const escaped = escapeHtml(decoded);

  // Escaped \n or \r\n (literal backslash-n in the game's text) as <br>.
  return escaped.replace(/\\r\\n|\\n/g, '<br>');
}

module.exports = { stringClean };
