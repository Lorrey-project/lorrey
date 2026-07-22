import requests
import json

# Send a dummy request to the local ai-worker
res = requests.post("http://localhost:8000/process", json={"file": "https://lorreyproject.s3.ap-south-1.amazonaws.com/upload-invoice/dummy.jpg"})
print("Status:", res.status_code)
print("Response:", res.text)
