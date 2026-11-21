// News posts are rich text written by GMs and admins (the Quill editor) and
// shown to everyone: only formatting survives, no scripts, event handlers or
// javascript: links (a GM's post could run in an admin's browser).
const sanitizeHtml = require('sanitize-html');

const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
                'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'span', 'img', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'], span: ['class'], p: ['class'], li: ['class'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowedClasses: { '*': [/^ql-[a-z0-9-]+$/] },
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
};

function cleanNewsHtml(html) {
  return sanitizeHtml(typeof html === 'string' ? html : '', OPTIONS);
}

module.exports = { cleanNewsHtml };
