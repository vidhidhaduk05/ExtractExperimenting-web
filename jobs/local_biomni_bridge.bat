@echo off
title Biomni-R0 Local Port 18000 Forwarder
color 0A
echo =====================================================================
echo         BIOMNI-R0 LOCAL PORT 18000 BRIDGE (WINDOWS)
echo =====================================================================
echo [*] Forwarding local http://127.0.0.1:18000 to HPC Cloudflare Tunnel:
echo     https://prize-burton-generate-routines.trycloudflare.com
echo.
echo [*] Keep this window open while using your software on Windows.
echo =====================================================================
echo.

python -c "
import http.server, urllib.request, socketserver

TUNNEL = 'https://prize-burton-generate-routines.trycloudflare.com'

class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f'[{self.command}] {self.path} -> {args[1] if len(args) > 1 else \"\"}')
    def do_GET(self): self._forward()
    def do_POST(self): self._forward()
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
    def _forward(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'content-length', 'accept-encoding')}
        headers['Accept-Encoding'] = 'identity'
        req = urllib.request.Request(TUNNEL + self.path, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() not in ('transfer-encoding', 'content-encoding', 'content-length'):
                        self.send_header(k, v)
                data = r.read()
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())

print('[+] Forwarder listening on http://127.0.0.1:18000')
print('[+] Your Windows software can now connect to http://127.0.0.1:18000/v1 !')
socketserver.TCPServer(('127.0.0.1', 18000), Proxy).serve_forever()
"

pause
