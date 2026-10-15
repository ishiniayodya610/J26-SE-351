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

    def do_POST(self):
        if self.path == '/simulate':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            temp = data.get('temp', 25.0)
            ph = data.get('ph', 7.0)
            tds = data.get('tds', 380.0)
            
            # Execute the compiled C++ Edge Impulse model
            executable_path = os.path.join(DIRECTORY, "runner", "build", "custom")
            
            try:
                result = subprocess.run([executable_path, str(temp), str(ph), str(tds)], capture_output=True, text=True, check=True)
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

with socketserver.TCPServer(("", PORT), SimulatorHandler) as httpd:
    print(f"Serving simulator at http://localhost:{PORT}")
    httpd.serve_forever()
