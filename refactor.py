import os
import re
import glob

# 1. FRONTEND REPLACEMENTS
frontend_dir = "/Users/soumodeeproy/Desktop/lorrey-project-code 2/frontend/review-dashboard/UI2/src"
for filepath in glob.glob(os.path.join(frontend_dir, "**", "*.jsx"), recursive=True) + glob.glob(os.path.join(frontend_dir, "**", "*.js"), recursive=True):
    with open(filepath, "r") as f:
        content = f.read()
    original = content

    # Replace API_URL
    content = re.sub(r"const API_URL\s*=\s*import\.meta\.env\.VITE_API_URL\s*\|\|.*?;", "const API_URL = import.meta.env.VITE_API_URL;", content)
    content = re.sub(r"export const API_URL\s*=\s*import\.meta\.env\.VITE_API_URL\s*\|\|.*?;", "export const API_URL = import.meta.env.VITE_API_URL;", content)

    # Dashboard specific socket
    content = re.sub(r"const _dashSocket = io\('/'.*?\);", "const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;\nconst _dashSocket = io(SOCKET_URL, {\n    autoConnect: true,\n    transports: [\"websocket\", \"polling\"]\n});", content)

    # General Socket block replacement
    socket_block = """const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || import.meta.env.VITE_API_URL;
const socket = io(SOCKET_URL, {
    autoConnect: true,
    transports: ["websocket", "polling"]
});"""
    content = re.sub(r"const SOCKET_URL = .*?;[\r\n]+const socket = io\(.*?\);", socket_block, content)
    content = re.sub(r"const socket = io\('.*?'(?:,\s*\{.*?\})?\);", socket_block, content)
    
    # Specific edge case in AccountDetails
    content = re.sub(r"socket = io\(SOCKET_URL,\s*\{.*?\}\);", "socket = io(SOCKET_URL, {\n    autoConnect: true,\n    transports: [\"websocket\", \"polling\"]\n});", content)

    # CementRegister fetch
    content = content.replace('fetch("http://localhost:3000/api', 'fetch(`${API_URL}')

    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated {filepath}")

# 2. BACKEND REPLACEMENTS
backend_dir = "/Users/soumodeeproy/Desktop/lorrey-project-code 2/backend-node"

# 2a. Remove fallback AI_WORKER_URL
for filename in ["server.js", "routes/invoiceRoutes.js", "utils/scannerWatcher.js"]:
    filepath = os.path.join(backend_dir, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            content = f.read()
        content = content.replace('const aiWorkerUrl = process.env.AI_WORKER_URL || "http://127.0.0.1:8000";', 'const aiWorkerUrl = process.env.AI_WORKER_URL;')
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated {filepath}")

# 2b. Update CORS in server.js
server_js = os.path.join(backend_dir, "server.js")
with open(server_js, "r") as f:
    content = f.read()

cors_original = r"""const allowedOrigins = [
  /^http:\/\/localhost:(5173|5174|5175|5176)$/,
  /^http:\/\/192\.168\.\d+\.\d+:(5173|5174|5175|5176)$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:(5173|5174|5175|5176)$/,
  /^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/
];"""

cors_new = """const allowedOrigins = [
  /^http:\\/\\/localhost:\\d+$/,
  /^https:\\/\\/[a-zA-Z0-9-]+\\.onrender\\.com$/
];"""

content = content.replace(cors_original, cors_new)

with open(server_js, "w") as f:
    f.write(content)
print("Updated server.js CORS")
