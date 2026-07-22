const rawApiUrl = import.meta.env.VITE_API_URL || '';
console.log("🛠️ [CONFIG] VITE_API_URL at build time was:", import.meta.env.VITE_API_URL);

if (!rawApiUrl) {
  console.error("🚨 CRITICAL ERROR: VITE_API_URL is missing! API calls will fail with 404 because they will hit the frontend domain.");
}

export const API_URL = rawApiUrl.replace(/\/+$/, '');
console.log("🛠️ [CONFIG] Exported API_URL is:", API_URL);
