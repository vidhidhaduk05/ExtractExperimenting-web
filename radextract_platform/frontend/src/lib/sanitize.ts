/**
 * Utility for sanitizing raw SVG markup before passing to dangerouslySetInnerHTML.
 * Removes script tags, event handlers, iframe/object elements, and dangerous URLs (e.g. javascript:).
 */

const DISALLOWED_TAGS = new Set([
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
]);

const DANGEROUS_URI_ATTRS = new Set(["href", "xlink:href", "src", "action", "data"]);

/**
 * Sanitizes an SVG string using the browser DOMParser API.
 * Safely removes malicious elements, inline event attributes, and JS URIs.
 */
export function sanitizeSvg(svgContent: string): string {
  if (!svgContent || typeof svgContent !== "string") {
    return "";
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // Basic fallback regex strip for SSR or non-browser environments
    return svgContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*(['"])[^'"]*\1/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");

    // Check if DOMParser returned a parsererror document
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      // Fallback to HTML parser if SVG parser failed
      const htmlDoc = parser.parseFromString(svgContent, "text/html");
      cleanTree(htmlDoc.body);
      return htmlDoc.body.innerHTML;
    }

    cleanTree(doc.documentElement);
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return svgContent;
  }
}

function cleanTree(node: Element) {
  const tagName = node.tagName.toLowerCase();
  if (DISALLOWED_TAGS.has(tagName)) {
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
    cleanTree(child);
  }
}
