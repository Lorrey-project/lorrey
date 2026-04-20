import pytest
from fastapi.testclient import TestClient
from pipeline import app

client = TestClient(app)

def test_home():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Invoice AI Worker Running"}

def test_process_invalid_file(monkeypatch):
    # Mock requests.get to return a 404
    class MockResponse:
        status_code = 404
    monkeypatch.setattr("requests.get", lambda url: MockResponse())

    response = client.post("/process", json={"file": "http://invalid-url.com/invoice.jpg"})
    assert response.status_code == 200 # App handles it and returns 200 with error key based on code
    assert response.json() == {"error": "Failed to download file from S3"}
