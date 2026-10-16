import http.server
import socketserver
import json
import subprocess
import os

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class SimulatorHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/reset':
            content_length = int(self.headers.get('Content-Length', 0))
            data = {}
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    data = json.loads(post_data.decode('utf-8'))
                except Exception:
                    pass
            temp = data.get('temp', 29.0)
            ph = data.get('ph', 6.5)
            tds = data.get('tds', 150.0)

            executable_path = os.path.join(DIRECTORY, "runner", "build", "custom")
            try:
                result = subprocess.run([executable_path, "--reset", str(temp), str(ph), str(tds)], capture_output=True, text=True, check=True)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(result.stdout.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        elif self.path == '/simulate':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            temp = data.get('temp', 29.0)
            ph = data.get('ph', 6.5)
            tds = data.get('tds', 150.0)

            prev_temp = data.get('prev_temp')
            prev_ph = data.get('prev_ph')
            prev_tds = data.get('prev_tds')
            
            # Execute the compiled C++ Edge Impulse model
            executable_path = os.path.join(DIRECTORY, "runner", "build", "custom")
            cmd = [executable_path, str(temp), str(ph), str(tds)]
            if prev_temp is not None and prev_ph is not None and prev_tds is not None:
                cmd.extend([str(prev_temp), str(prev_ph), str(prev_tds)])
            
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                json_output = result.stdout
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json_output.encode('utf-8'))
            except subprocess.CalledProcessError as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = json.dumps({"error": "Failed to run C++ simulation", "details": e.stderr})
                self.wfile.write(error_response.encode('utf-8'))
            except FileNotFoundError:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = json.dumps({"error": "C++ Binary not found. Waiting for compilation to finish..."})
                self.wfile.write(error_response.encode('utf-8'))

        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), SimulatorHandler) as httpd:
        print(f"Edge IoT Device Simulator running at http://localhost:{PORT}")
        httpd.serve_forever()
