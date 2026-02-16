import http.server
import socketserver
import subprocess
import json
import os
import sys

PORT = 8000
AUTH_FILE = 'Assets/Agents/Core/auth.json'
PROJECTS_FILE = 'Assets/Agents/Core/projects.json'

class SVNHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/projects':
            projects = self.load_data(PROJECTS_FILE)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(projects).encode())
        
        elif self.path == '/api/auth':
            auth = self.load_data(AUTH_FILE)
            # Remove password for safety when sending to UI
            safe_auth = {k: {"username": v["username"]} for k, v in auth.items()}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(safe_auth).encode())

        elif self.path == '/api/browse-native':
            try:
                # Use AppleScript to open native macOS folder picker
                cmd = "osascript -e 'POSIX path of (choose folder with prompt \"Select SVN Workspace Folder\")'"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode == 0:
                    path = result.stdout.strip()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"path": path}).encode())
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(json.dumps({"path": None}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        elif self.path.startswith('/api/validate-repo'):
            from urllib.parse import urlparse, parse_qs
            query = parse_qs(urlparse(self.path).query)
            path = query.get('path', [''])[0]
            
            is_svn = os.path.isdir(os.path.join(path, '.svn'))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"isValid": is_svn}).encode())
        else:
            return super().do_GET()

    def do_POST(self):
        if self.path == '/api/svn':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            command = data.get('command', [])
            cwd = data.get('cwd', None)
            repo_url = data.get('url', None) # Useful for finding credentials

            # Try to find credentials for this URL or globally
            auth_data = self.load_data(AUTH_FILE)
            creds = None
            if repo_url:
                clean_repo_url = repo_url.rstrip('/')
                for key, val in auth_data.items():
                    if key == "global": continue
                    if key.rstrip('/') in clean_repo_url:
                        creds = val
                        break
            
            # Use global if no specific match
            if not creds and "global" in auth_data:
                creds = auth_data["global"]

            auth_args = []
            password_stdin = None
            if creds:
                auth_args = ["--username", creds["username"]]
                password_stdin = creds["password"]

            try:
                if cwd and not os.path.exists(cwd) and command[0] != 'checkout':
                    raise Exception(f"Directory not found: {cwd}")

                # Build execution command
                exec_cmd = [sys.executable, 'execution/svn_tool.py']
                if cwd:
                    exec_cmd += ["--cwd", cwd]

                exec_cmd += command + auth_args

                # Pass password via stdin to avoid process list exposure
                result = subprocess.run(
                    exec_cmd,
                    capture_output=True,
                    text=True,
                    input=password_stdin,
                    cwd=os.getcwd()
                )
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(result.stdout.encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
        
        elif self.path == '/api/projects':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            project = json.loads(post_data)
            projects = self.load_data(PROJECTS_FILE)
            if not any(p['path'] == project['path'] for p in projects):
                projects.append(project)
                self.save_data(PROJECTS_FILE, projects)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode())

        elif self.path == '/api/projects/delete':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            path_to_remove = data.get('path')
            
            projects = self.load_data(PROJECTS_FILE)
            projects = [p for p in projects if p['path'] != path_to_remove]
            self.save_data(PROJECTS_FILE, projects)
            
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode())
        
        elif self.path == '/api/auth':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            creds = json.loads(post_data)
            # creds: { "url": "...", "username": "...", "password": "..." }
            
            auth_data = self.load_data(AUTH_FILE)
            key = creds.get("url", "global")
            auth_data[key] = {
                "username": creds["username"],
                "password": creds["password"]
            }
            self.save_data(AUTH_FILE, auth_data)
            
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode())
        elif self.path == '/api/delete':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            path = data.get('path')
            cwd = data.get('cwd')
            
            if not path:
                self.send_response(400)
                self.end_headers()
                return

            full_path = os.path.join(cwd, path) if cwd else path
            
            try:
                import shutil
                if os.path.isdir(full_path):
                    shutil.rmtree(full_path)
                else:
                    os.remove(full_path)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def load_data(self, path):
        if os.path.exists(path):
            with open(path, 'r') as f:
                return json.load(f)
        return {} if 'auth' in path else []

    def save_data(self, path, data):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            json.dump(data, f)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    print(f"Starting SVN Antigravity Server on http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), SVNHandler) as httpd:
        httpd.serve_forever()
