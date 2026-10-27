#!/usr/bin/env python3
"""Comprehensive website element testing harness powered by jev-ultrafast + local Laya model.

Systematically visits every route, tests interactive buttons, modals, tabs, and form elements,
and captures uncaught JS errors, React crashes, broken endpoints, and DOM regressions.
"""

import json
import os
import sys
import time
from pathlib import Path

# Setup paths and environment
REPO_ROOT = "/home/vd00026/Desktop/Software"
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

os.environ["USE_LOCAL_LAYA"] = "1"
os.environ["LAYA_MODEL_DIR"] = os.path.join(REPO_ROOT, "laya/models")
os.environ["LAYA_REPO_ROOT"] = REPO_ROOT
os.environ["BU_CDP_URL"] = "http://127.0.0.1:9222"
os.environ["TEXT_MODEL_BASE_URL"] = "http://127.0.0.1:18000/v1"
os.environ["TEXT_MODEL"] = "biomni-r0"
os.environ["TEXT_MODEL_API_KEY"] = "sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"

from browser_harness.helpers import cdp
from jev_ultrafast.browser import Browser
from jev_ultrafast.model import choose

INJECT_MONITOR_JS = """
(() => {
    // Non-blocking dialog overrides
    window.confirm = (msg) => {
        window.__automation_dialogs = window.__automation_dialogs || [];
        window.__automation_dialogs.push({type: 'confirm', message: String(msg)});
        return false;
    };
    window.alert = (msg) => {
        window.__automation_dialogs = window.__automation_dialogs || [];
        window.__automation_dialogs.push({type: 'alert', message: String(msg)});
    };
    window.prompt = (msg, def) => {
        window.__automation_dialogs = window.__automation_dialogs || [];
        window.__automation_dialogs.push({type: 'prompt', message: String(msg)});
        return def || '';
    };

    if (window.__automation_initialized) return;
    window.__automation_initialized = true;
    window.__automation_errors = [];
    window.__network_failures = [];
    window.__automation_dialogs = [];

    window.addEventListener('error', (e) => {
        window.__automation_errors.push({
            type: 'uncaught_error',
            message: e.message || String(e),
            source: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            stack: e.error ? e.error.stack : null
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        window.__automation_errors.push({
            type: 'unhandled_rejection',
            message: e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled rejection',
            stack: e.reason && e.reason.stack ? e.reason.stack : null
        });
    });

    const origConsoleError = console.error;
    console.error = (...args) => {
        const msg = args.map(a => {
            try {
                return typeof a === 'object' ? JSON.stringify(a) : String(a);
            } catch (_) {
                return String(a);
            }
        }).join(' ');
        window.__automation_errors.push({
            type: 'console_error',
            message: msg
        });
        origConsoleError.apply(console, args);
    };

    // Intercept fetch to track 4xx / 5xx responses
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
        try {
            const resp = await origFetch.apply(window, args);
            if (!resp.ok) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
                window.__network_failures.push({
                    url: url,
                    status: resp.status,
                    statusText: resp.statusText
                });
            }
            return resp;
        } catch (err) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
            window.__network_failures.push({
                url: url,
                error: err.message || String(err)
            });
            throw err;
        }
    };
})();
"""


class WebsiteTester:
    def __init__(self, base_url="http://127.0.0.1:5173", project_id="4826596b-a6c6-4a39-bd59-4d98d38511b6"):
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self.results = []
        self.browser = None

    def start(self):
        self.browser = Browser(f"{self.base_url}/")
        try:
            self.browser.call("Page.enable")
        except Exception:
            pass
        time.sleep(1)

    def close(self):
        if self.browser:
            try:
                self.browser.close()
            except Exception:
                pass
            self.browser = None

    def navigate(self, path):
        full_url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            if self.browser:
                try:
                    self.browser.close()
                except Exception:
                    pass
            self.browser = Browser(full_url)
            time.sleep(1.2)
            self.browser.evaluate(INJECT_MONITOR_JS)
            time.sleep(0.3)
        except Exception as e:
            print(f"  Navigation error: {e}")

    def get_errors(self):
        try:
            errors = self.browser.evaluate("window.__automation_errors || []")
            net_fails = self.browser.evaluate("window.__network_failures || []")
            dialogs = self.browser.evaluate("window.__automation_dialogs || []")
            self.browser.evaluate("window.__automation_errors = []; window.__network_failures = []; window.__automation_dialogs = [];")
            return errors or [], net_fails or [], dialogs or []
        except Exception:
            return [], [], []

    def get_interactive_elements(self, page_content_only=True):
        """Query all clickable buttons and controls directly from the DOM."""
        js_get_elements = f"""
        (() => {{
            const elements = [];
            const candidates = document.querySelectorAll(
                'button, [role="button"], [role="tab"], select, input[type="checkbox"], input[type="radio"], input[type="button"], a[href]'
            );
            for (let i = 0; i < candidates.length; i++) {{
                const el = candidates[i];
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const isVisible = rect.width > 0 && rect.height > 0 &&
                    style.visibility !== 'hidden' && style.display !== 'none' &&
                    style.opacity !== '0';
                if (!isVisible) continue;

                // Optionally skip sidebar nav links so we focus on page content controls
                const isSidebar = Boolean(el.closest('aside, nav, [data-sidebar="true"]'));
                if ({str(page_content_only).lower()} && isSidebar && el.tagName === 'A') {{
                    continue;
                }}

                // Extract label
                let label = el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '';
                label = label.replace(/\\s+/g, ' ').trim();
                if (!label && el.tagName === 'INPUT') {{
                    label = el.placeholder || el.value || '';
                }}
                if (!label) {{
                    label = `<${{el.tagName.toLowerCase()}} class="${{el.className.slice(0, 30)}}">`;
                }}

                const isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true';

                elements.push({{
                    index: i,
                    tagName: el.tagName.toLowerCase(),
                    role: el.getAttribute('role') || el.tagName.toLowerCase(),
                    label: label.slice(0, 100),
                    disabled: isDisabled,
                    x: Math.round(rect.x + rect.width / 2),
                    y: Math.round(rect.y + rect.height / 2),
                    isModal: Boolean(el.closest('[role="dialog"], .modal, [data-modal="true"]'))
                }});
            }}
            return elements;
        }})()
        """
        try:
            return self.browser.evaluate(js_get_elements) or []
        except Exception:
            return []

    def click_element(self, el):
        """Click element safely via non-blocking JS event dispatch with dialog safety."""
        try:
            clicked = self.browser.evaluate(f"""
            (() => {{
                // Ensure dialogs are non-blocking before click
                window.confirm = () => false;
                window.alert = () => {{}};
                window.prompt = () => '';

                const candidates = document.querySelectorAll(
                    'button, [role="button"], [role="tab"], select, input[type="checkbox"], input[type="radio"], input[type="button"], a[href]'
                );
                const target = candidates[{el["index"]}];
                if (!target) return false;
                target.scrollIntoView({{behavior: 'instant', block: 'center', inline: 'center'}});
                target.focus?.();
                target.click();
                return true;
            }})()
            """)
            time.sleep(0.3)
            return clicked
        except Exception as e:
            try:
                self.browser.call("Input.dispatchMouseEvent", type="mousePressed", x=el["x"], y=el["y"], button="left", clickCount=1)
                time.sleep(0.05)
                self.browser.call("Input.dispatchMouseEvent", type="mouseReleased", x=el["x"], y=el["y"], button="left", clickCount=1)
                time.sleep(0.3)
                return True
            except Exception as e2:
                print(f"      Click notice: {e2}")
                return False

    def dismiss_modals_if_open(self):
        """Check if any modal is open and click close/cancel if found."""
        dismiss_js = """
        (() => {
            const closeBtn = document.querySelector(
                '[role="dialog"] button[aria-label*="close" i], [role="dialog"] button[title*="close" i], [role="dialog"] button.close, [role="dialog"] button:has(svg.lucide-x)'
            );
            if (closeBtn) {
                closeBtn.click();
                return true;
            }
            return false;
        })()
        """
        try:
            closed = self.browser.evaluate(dismiss_js)
            if closed:
                time.sleep(0.3)
        except Exception:
            pass

    def test_route(self, route_name, path, max_clicks=20):
        print(f"\n==========================================")
        print(f"Testing Route: {route_name} (path: #{path})")
        print(f"==========================================")

        try:
            self.navigate(path)
        except Exception as e:
            print(f"  Navigation failed: {e}")
            return {"route_name": route_name, "path": path, "render_ok": False, "error": str(e)}

        initial_errors, initial_net_fails, initial_dialogs = self.get_errors()

        try:
            page_title = self.browser.evaluate("document.title") or ""
            has_root = self.browser.evaluate("Boolean(document.getElementById('root')?.children?.length)")
            has_error_boundary = self.browser.evaluate(
                "Boolean(document.body.innerText.includes('Something went wrong') || document.body.innerText.includes('Application Error'))"
            )
        except Exception:
            page_title = ""
            has_root = False
            has_error_boundary = True

        route_record = {
            "route_name": route_name,
            "path": path,
            "title": page_title,
            "render_ok": has_root and not has_error_boundary,
            "initial_errors": initial_errors,
            "initial_net_fails": initial_net_fails,
            "tested_elements": [],
        }

        if has_error_boundary:
            print(f"  CRITICAL: Error boundary triggered on {path}!")
            self.results.append(route_record)
            return route_record

        # Test local Laya decision on this page
        try:
            obs = self.browser.observe(screenshot=False)
            goal = f"Evaluate and interact with {route_name} page features and data controls"
            decision = choose(obs, goal, [])
            print(f"  Laya Model System-1: op={decision['operation']}, target={decision.get('target')} choice={decision['choice']} (conf: {decision['confidence']})")
            route_record["laya_decision"] = {
                "operation": decision["operation"],
                "target": decision.get("target"),
                "choice": decision["choice"],
                "confidence": decision["confidence"],
                "latency_ms": decision["latency_ms"]
            }
        except Exception as e:
            print(f"  Laya decision notice: {e}")
            route_record["laya_decision_error"] = str(e)

        # Get page-content specific interactive elements
        elements = self.get_interactive_elements(page_content_only=True)
        print(f"  Found {len(elements)} page-content interactive elements.")

        # Click through page elements
        clicked_count = 0
        for el in elements:
            if clicked_count >= max_clicks:
                break
            if el["disabled"]:
                continue

            label = el["label"]
            lower_label = label.lower()
            if any(skip in lower_label for skip in ["delete project", "remove project", "logout", "sign out"]):
                continue

            print(f"   -> Testing [{el['role']}] '{label}'")
            try:
                before_url = self.browser.evaluate("window.location.hash") or ""
            except Exception:
                before_url = ""

            try:
                self.click_element(el)
            except Exception as e:
                print(f"      Click threw: {e}")

            try:
                after_url = self.browser.evaluate("window.location.hash") or ""
            except Exception:
                after_url = ""

            errors, net_fails, dialogs = self.get_errors()

            el_result = {
                "label": label,
                "role": el["role"],
                "url_before": before_url,
                "url_after": after_url,
                "errors": errors,
                "net_fails": net_fails,
                "dialogs": dialogs,
                "status": "ok" if not errors and not net_fails else "failed"
            }

            if errors:
                print(f"      ERROR: {errors[0]['message']}")
            if net_fails:
                print(f"      API failure: {net_fails[0]}")
            if dialogs:
                print(f"      Dialog intercepted: {dialogs[0]}")

            route_record["tested_elements"].append(el_result)
            clicked_count += 1

            # Dismiss modal if one was opened
            self.dismiss_modals_if_open()

            # If clicking navigated away, navigate back to preserve page state
            if after_url != before_url and path not in after_url:
                print(f"      Navigated to {after_url}; returning to {path}")
                self.navigate(path)

        self.results.append(route_record)
        return route_record


if __name__ == "__main__":
    tester = WebsiteTester(project_id="1f209599-cfc6-48c5-a43c-422a96052930")
    try:
        tester.start()
        pid = tester.project_id
        routes_to_test = [
            ("Landing Page", "/"),
            ("Projects List", "/projects"),
            ("Project Overview", f"/projects/{pid}"),
            ("Studies Workbench", f"/projects/{pid}/studies"),
            ("Screening Workbench", f"/projects/{pid}/screening"),
            ("Extraction Sheet Matrix", f"/projects/{pid}/extraction-sheet"),
            ("PRISMA 2020 Flow", f"/projects/{pid}/prisma"),
            ("Risk of Bias (RoB)", f"/projects/{pid}/rob"),
            ("Meta-Analysis", f"/projects/{pid}/meta-analysis"),
            ("PICO & Hypothesis", f"/projects/{pid}/pico"),
            ("Export", f"/projects/{pid}/export"),
            ("Claimscape", "/claimscape"),
            ("Citation Telephone", "/citation-telephone"),
            ("RigorScan", "/rigor-scan"),
            ("Code Graph", "/graph/code"),
        ]

        for name, path in routes_to_test:
            try:
                tester.test_route(name, path, max_clicks=12)
            except Exception as e:
                print(f"Error testing route {name}: {e}")

        # Write results
        out_path = Path(REPO_ROOT) / "jev_test_results.json"
        out_path.write_text(json.dumps(tester.results, indent=2))
        print(f"\n==========================================")
        print(f"All tests completed! Full results saved to {out_path}")
        print(f"==========================================")

    finally:
        tester.close()
