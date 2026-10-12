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
 * Sanitizes raw SVG strings by parsing them with DOMParser and removing
 * dangerous tags (<script>, <iframe>, etc.), inline event handlers (onload, onerror, etc.),
 * and dangerous URI protocols (javascript:, data:) from href and xlink:href attributes.
 */
export function sanitizeSvg(svgString: string): string {
  if (!svgString) return "";

  // Return original input if DOMParser is unavailable (e.g. non-browser test environment without DOM)
  if (typeof DOMParser === "undefined") {
    return svgString;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "text/html");

  // Remove dangerous executable / embed tags
  const forbiddenTags = ["script", "iframe", "object", "embed", "foreignobject"];
  forbiddenTags.forEach((tag) => {
    const elements = doc.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  });

  // Clean attributes on all elements
  const allElements = doc.querySelectorAll("*");
  allElements.forEach((el) => {
    const attrs = Array.from(el.attributes);
    attrs.forEach((attr) => {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();

      // Remove inline event handlers (e.g. onload, onerror, onclick)
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }

      // Remove dangerous protocol schemes in link attributes
      if (name === "href" || name === "xlink:href" || name.endsWith(":href")) {
        if (val.startsWith("javascript:") || val.startsWith("data:")) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });

  return doc.body.innerHTML || "";
}
