## 2026-10-15 - DOMParser SVG Sanitization for dangerouslySetInnerHTML
**Vulnerability:** Cross-Site Scripting (XSS) risk when rendering SVG strings returned from API endpoints (such as robvis figures or R plot diagrams) using `dangerouslySetInnerHTML`. Malicious SVGs could include embedded `<script>` tags, inline event handler attributes (`onload`, `onclick`), or `javascript:` URIs.
**Learning:** Browser native `DOMParser` provides a safe, dependency-free way to parse and clean SVG strings. However, if XML parsing fails due to non-strict SVG markup, parsing as `text/html` fallback is necessary.
**Prevention:** Always pass dynamic or third-party SVG strings through `sanitizeSvg` before supplying them to React's `dangerouslySetInnerHTML`.
