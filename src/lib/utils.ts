import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function judgmentColor(judgment: string): string {
  const colors: Record<string, string> = {
    low: "bg-rob-low text-white",
    some_concerns: "bg-rob-some text-white",
    unclear: "bg-rob-unclear text-white",
    moderate: "bg-rob-moderate text-white",
    high: "bg-rob-high text-white",
    serious: "bg-rob-serious text-white",
    critical: "bg-rob-critical text-white",
    no_information: "bg-rob-noinfo text-white",
    pending: "bg-rob-pending text-gray-600",
  };
  return colors[judgment] || "bg-gray-200 text-gray-600";
}

export function judgmentLabel(judgment: string): string {
  const labels: Record<string, string> = {
    low: "Low",
    some_concerns: "Some Concerns",
    unclear: "Unclear",
    moderate: "Moderate",
    high: "High",
    serious: "Serious",
    critical: "Critical",
    no_information: "No Information",
    pending: "Pending",
  };
  return labels[judgment] || judgment;
}

export function judgmentDotColor(judgment: string): string {
  const colors: Record<string, string> = {
    low: "#75A025",
    some_concerns: "#FF9400",
    unclear: "#FF9400",
    moderate: "#FF9400",
    high: "#E94444",
    serious: "#E94444",
    critical: "#B00000",
    no_information: "#999999",
    pending: "#CCCCCC",
  };
  return colors[judgment] || "#CCCCCC";
}

/**
 * Sanitizes SVG markup strings to prevent XSS vulnerabilities when rendered via dangerouslySetInnerHTML.
 * Strips dangerous tags (<script>, <iframe>, <object>, <embed>), inline event attributes (on*),
 * and dangerous URIs (javascript:, data:) in href/xlink:href attributes.
 */
export function sanitizeSvg(svgString: string): string {
  if (!svgString || typeof svgString !== "string") {
    return "";
  }

  if (typeof DOMParser === "undefined") {
    return regexSanitizeSvg(svgString);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "text/html");

    const dangerousTags = ["script", "iframe", "object", "embed", "style"];
    for (const tag of dangerousTags) {
      const elements = doc.querySelectorAll(tag);
      elements.forEach((el) => el.remove());
    }

    const allElements = doc.querySelectorAll("*");
    allElements.forEach((el) => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();

        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
          if (attr.namespaceURI) {
            el.removeAttributeNS(attr.namespaceURI, attr.localName);
          }
        } else if (
          name === "href" || name === "xlink:href" || name.endsWith(":href") || attr.localName === "href"
        ) {
          if (!isSafeUrl(attr.value)) {
            el.removeAttribute(attr.name);
            el.removeAttribute("href");
            el.removeAttribute("xlink:href");
            if (attr.namespaceURI) {
              el.removeAttributeNS(attr.namespaceURI, attr.localName);
            }
          }
        }
      }
    });

    return doc.body.innerHTML;
  } catch {
    return regexSanitizeSvg(svgString);
  }
}

function isSafeUrl(url: string): boolean {
  if (!url) return true;

  // Remove control characters and whitespace
  let cleaned = url.replace(/[\x00-\x20\s]/g, "").toLowerCase();

  // Decode HTML entity encodings
  cleaned = cleaned
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/gi, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&[a-z]+;?/gi, "");

  // Remove control characters and whitespace again after decoding
  cleaned = cleaned.replace(/[\x00-\x20\s]/g, "").toLowerCase();

  const colonIndex = cleaned.indexOf(":");
  if (colonIndex !== -1) {
    const scheme = cleaned.substring(0, colonIndex);
    const safeSchemes = ["http", "https", "mailto", "tel"];
    if (!safeSchemes.includes(scheme)) {
      return false;
    }
  }
  return true;
}

function regexSanitizeSvg(svgString: string): string {
  return svgString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(?:"(?:javascript|vbscript|data|&#|&):[^"]*"|'(?:javascript|vbscript|data|&#|&):[^']*'|(?:javascript|vbscript|data):[^\s>]+)/gi, "");
}
