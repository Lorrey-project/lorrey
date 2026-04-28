from diagrams import Diagram, Cluster, Edge
from diagrams.programming.framework import React
from diagrams.programming.language import Nodejs, Python
from diagrams.onprem.database import MongoDB
from diagrams.aws.storage import S3
from diagrams.generic.compute import Rack
from diagrams.onprem.compute import Server
from diagrams.custom import Custom

with Diagram("Lorrey Project Architecture", show=False, filename="Lorrey_Architecture", direction="TB"):

    with Cluster("Local Hardware"):
        scanner = Rack("Physical Scanners\n(HP, Epson, Canon)")
        folder = Server("Lorrey_Scans\n(Local Directory)")
        scanner >> folder

    with Cluster("User Portals (React / Vite)"):
        office = React("Head Office")
        site = React("Site Admin")
        sas1 = React("SAS-1 Pump")
        sas2 = React("SAS-2 Pump")

    with Cluster("Node.js Backend (Port 3000)"):
        api = Nodejs("Express API")
        socket = Nodejs("Socket.io Server")
        watcher = Nodejs("Scanner Watcher\n(chokidar)")
        
        folder >> watcher
        watcher >> api

    with Cluster("AI Processing Layer (Port 8000)"):
        fastapi = Python("FastAPI Worker")
        gemini = Server("Google Gemini API")
        
        fastapi >> gemini

    with Cluster("Cloud Storage & Data"):
        mongo = MongoDB("Atlas Database")
        s3 = S3("AWS S3")

    # Connections
    portals = [office, site, sas1, sas2]
    for p in portals:
        p >> Edge(label="HTTP/REST") >> api
        p << Edge(label="WebSocket") << socket

    api >> Edge(label="Upload/Read") >> s3
    api >> Edge(label="Read/Write") >> mongo
    
    api >> Edge(label="Trigger AI") >> fastapi
    fastapi >> Edge(label="Return JSON") >> api
    
    api >> Edge(label="Notify") >> socket
