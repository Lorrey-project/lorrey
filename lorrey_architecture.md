# Lorrey Project Architecture

This architecture diagram illustrates the complete system topology of the Lorrey Project, including the multi-portal frontend, backend microservices, real-time communication, and physical hardware integrations.

```mermaid
flowchart TB
    %% Styling Definitions
    classDef frontend fill:#61DAFB,stroke:#000,stroke-width:2px,color:#000
    classDef backend fill:#8CC84B,stroke:#000,stroke-width:2px,color:#000
    classDef python fill:#3776AB,stroke:#000,stroke-width:2px,color:#FFF
    classDef db fill:#47A248,stroke:#000,stroke-width:2px,color:#FFF
    classDef cloud fill:#FF9900,stroke:#000,stroke-width:2px,color:#000
    classDef hardware fill:#E2E8F0,stroke:#64748B,stroke-width:2px,stroke-dasharray: 5 5,color:#0F172A

    subgraph UserPortals ["Frontend: React Dashboards (Vite)"]
        direction LR
        HO[Head Office Portal]:::frontend
        SA[Site Admin Portal]:::frontend
        SAS1[SAS-1 Pump Portal]:::frontend
        SAS2[SAS-2 Pump Portal]:::frontend
    end

    subgraph CoreBackend ["Node.js Backend (Express & Socket.io)"]
        direction TB
        API[REST API Server \n Port: 3000]:::backend
        WS[Socket.io Server \n Real-time Events]:::backend
        SW[Scanner Watcher \n chokidar module]:::backend
    end

    subgraph AIProcessing ["AI Processing Layer"]
        direction TB
        FastAPI[FastAPI Server \n Port: 8000]:::python
        Gemini[Google Gemini API / OCR \n Extractor]:::cloud
    end

    subgraph DataStorage ["Data & Storage Layer"]
        direction LR
        Mongo[(MongoDB Atlas \n Invoices, Users, \n Cement Register)]:::db
        S3[(AWS S3 \n PDFs, Scans, \n Hire Slips)]:::cloud
    end

    subgraph Hardware ["Local Hardware"]
        Scanner[[Physical Scanners \n HP, Epson, Canon]]:::hardware
        LocalFolder[Lorrey_Scans \n Local Directory]:::hardware
    end

    %% Flow Connections
    
    %% Users to Backend
    UserPortals -- HTTP/REST Requests --> API
    UserPortals <.. WebSocket Real-time Updates ..> WS

    %% Scanner Flow
    Scanner -- Scan to Folder --> LocalFolder
    LocalFolder -- Detected via Chokidar --> SW
    SW -- Process Trigger --> API
    
    %% API to Storage
    API -- Upload Files --> S3
    API -- Read/Write Data --> Mongo

    %% Backend to AI Worker
    API -- Send S3 URL for Extraction --> FastAPI
    FastAPI -- Extracted JSON Data --> API
    
    %% AI to External
    FastAPI -- Process Image/PDF --> Gemini

    %% Realtime Internal
    API -- Notify Completion --> WS

```

### Component Breakdown

1.  **Frontend Dashboards (React/Vite)**
    *   Separate specialized environments (`dev:office`, `dev:site`, `dev:sas1`, `dev:sas2`) tailored for different user roles.
    *   Connects to the backend via REST API and Socket.io for real-time document processing updates.

2.  **Node.js Backend (Express)**
    *   Serves as the central orchestrator (running on port `3000`).
    *   Handles authentication, data persistence, file uploads to AWS S3, and data synchronization between sub-registers (e.g., Cement Register, GST Portal).
    *   Includes `scannerWatcher.js` which monitors a local directory for hardware scanner outputs.

3.  **AI Worker (Python/FastAPI)**
    *   A dedicated microservice running on port `8000`.
    *   Receives S3 document URLs from the Node backend, processes them using OCR and AI extraction (Gemini), and returns structured JSON data back to the main API.

4.  **Storage & Database**
    *   **MongoDB Atlas**: The central source of truth for structured data (Invoices, Lorry Hire Slips, Fuel Slips, User Data).
    *   **AWS S3**: Secure cloud storage for all original physical documents and generated PDFs.

5.  **Local Hardware Integration**
    *   Physical scanners push documents directly to a local watched folder (`Lorrey_Scans`). The Node backend auto-detects these, uploads them, triggers the AI worker, and pushes the results to the frontend dashboards entirely autonomously.
