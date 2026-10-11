import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function judgmentColor(judgment: string): string {
  const colors: Record<string, string> = {
    low: "bg-rob-low text-white",
    some_concerns: "bg-rob-some text-white",
    unclear: "bg-[#FF9400] text-white",
    moderate: "bg-[#FF9400] text-white",
    high: "bg-[#E94444] text-white",
    serious: "bg-[#E94444] text-white",
    critical: "bg-[#B00000] text-white",
    no_information: "bg-[#999999] text-white",
    pending: "bg-[#CCCCCC] text-gray-600",
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
 * Sanitizes raw SVG markup to prevent Cross-Site Scripting (XSS) attacks.
 * Strips script tags, unsafe elements, event handler attributes (on*),
 * and dangerous URIs (javascript:, data:text/html).
 */
export function sanitizeSvg(svgContent: string): string {
  if (!svgContent) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // Fallback regex sanitization if running outside browser/DOM context
    return svgContent
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\s*on\w+\s*=\s*(['"])(.*?)\1/gi, "")
      .replace(/\s*href\s*=\s*(['"])javascript:(.*?)\1/gi, "");
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");

    // Check for XML parse errors
    if (doc.querySelector("parsererror")) {
      // Fall back to text/html parsing if XML parsing failed
      const htmlDoc = parser.parseFromString(svgContent, "text/html");
      const FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "applet", "meta", "form", "base"];
      FORBIDDEN_TAGS.forEach((tag) => {
        htmlDoc.querySelectorAll(tag).forEach((el) => el.remove());
      });
      htmlDoc.querySelectorAll("*").forEach((el) => {
        Array.from(el.attributes).forEach((attr) => {
          const attrName = attr.name.toLowerCase();
          const attrValue = attr.value.trim().toLowerCase();
          if (attrName.startsWith("on")) {
            el.removeAttribute(attr.name);
          } else if (
            (attrName === "href" || attrName === "xlink:href" || attrName === "src") &&
            (attrValue.startsWith("javascript:") || attrValue.startsWith("data:text/html") || attrValue.startsWith("vbscript:"))
          ) {
            el.removeAttribute(attr.name);
          }
        });
      });
      return htmlDoc.body.innerHTML;
    }

    const FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "applet", "meta", "form", "base"];

    FORBIDDEN_TAGS.forEach((tag) => {
      const elements = doc.querySelectorAll(tag);
      elements.forEach((el) => el.remove());
    });

    const allElements = doc.querySelectorAll("*");
    allElements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const attrName = attr.name.toLowerCase();
        const attrValue = attr.value.trim().toLowerCase();

        if (attrName.startsWith("on")) {
          el.removeAttribute(attr.name);
        } else if (
          (attrName === "href" || attrName === "xlink:href" || attrName === "src") &&
          (attrValue.startsWith("javascript:") || attrValue.startsWith("data:text/html") || attrValue.startsWith("vbscript:"))
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc.documentElement);
  } catch (err) {
    console.error("Failed to sanitize SVG:", err);
    return "";
  }
}
