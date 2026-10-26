/**
 * Utility for sanitizing raw SVG markup and HTML content before passing to dangerouslySetInnerHTML.
 * Removes script tags, event handlers, iframe/object elements, and dangerous URLs (e.g. javascript:).
 */

const DISALLOWED_SVG_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "foreignobject",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "base",
  "link",
  "meta",
  "style",
  "animate",
  "set",
  "animatetransform",
  "animatecolor",
]);

const DISALLOWED_HTML_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "link",
  "meta",
  "applet",
]);

const DANGEROUS_URI_ATTRS = new Set(["href", "xlink:href", "src", "action", "data"]);

/**
 * Sanitizes an HTML string using the browser DOMParser API.
 * Safely removes executable script/iframe tags, inline event attributes, and dangerous URIs.
 */
export function sanitizeHtml(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== "string") {
    return "";
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return "";
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    cleanTree(doc.body, DISALLOWED_HTML_TAGS);
    return doc.body.innerHTML;
  } catch {
    return "";
  }
}

/**
 * Sanitizes an SVG string using the browser DOMParser API.
 * Safely removes malicious elements, inline event attributes, and JS URIs.
 */
export function sanitizeSvg(svgContent: string): string {
  if (!svgContent || typeof svgContent !== "string") {
    return "";
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return "";
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");

    // Check if DOMParser returned a parsererror document
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      // Fallback to HTML parser if SVG parser failed
      const htmlDoc = parser.parseFromString(svgContent, "text/html");
      cleanTree(htmlDoc.body, DISALLOWED_SVG_TAGS);
      return htmlDoc.body.innerHTML;
    }

    cleanTree(doc.documentElement, DISALLOWED_SVG_TAGS);
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return "";
  }
}

function cleanTree(node: Element, disallowedTags: Set<string> = DISALLOWED_SVG_TAGS) {
  const tagName = node.tagName.toLowerCase();
  if (disallowedTags.has(tagName)) {
    node.remove();
    return;
  }

  // Clean element's own attributes
  const attributes = Array.from(node.attributes);
  for (const attr of attributes) {
    const attrName = attr.name.toLowerCase();

    // Remove inline event handlers (onload, onclick, onerror, etc.)
    if (attrName.startsWith("on")) {
      node.removeAttribute(attr.name);
      continue;
    }

    // Check URI attributes for dangerous schemes (javascript:, data:text/html)
    if (DANGEROUS_URI_ATTRS.has(attrName)) {
      const value = attr.value.trim().toLowerCase();
      if (value.startsWith("javascript:") || value.startsWith("data:text/html") || value.startsWith("vbscript:")) {
        node.removeAttribute(attr.name);
      }
    }
  }

  // Recursively clean children
  const children = Array.from(node.children);
  for (const child of children) {
    cleanTree(child, disallowedTags);
  }
}
