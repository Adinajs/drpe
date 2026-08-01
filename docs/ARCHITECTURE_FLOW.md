# DRPE Platform Architecture & Flow

This document details the operational lifecycle of the Dynamic Risk Posture Evaluation (DRPE) system, from user interaction to autonomous reconnaissance.

## 1. Tactical Command (Frontend)
The user interacts with the React/Vite dashboard. All commands (starting scans, updating profile, rotating keys) are sent via secure API requests to the backend logic.

- **State Management**: React Context (`AuthContext`, `ThemeContext`, `SearchContext`).
- **Communication**: REST API using Axios/Fetch with JWT Bearer tokens for security.

## 2. Intelligence Orchestrator (Backend)
The FastAPI backend acts as the brain of the platform. It manages the database, triggers external scanners, and runs the neural analysis engine.

### Data Flow Lifecycle:
1. **Request Reception**: API endpoints receive commands and validate authentication.
2. **Scan Dispatcher**: When a scan is triggered, the `vuln_scanner` module establishes an SSH tunnel to the Kali/GVM agent.
3. **Autonomous Polling**: A background task constantly monitors active GVM tasks. When a scan finishes, the **Synchronization Pipeline** automatically pulls the XML report, parses results, and populates the `assets` and `vulnerabilities` tables.
4. **Risk Recalculation**: Every new finding triggers the **Neural Risk Engine**, which updates the composite IP risk scores and takes a posture snapshot for the global heatmap.

## 3. Reconnaissance Agents (External)
- **GVM (OpenVAS)**: Performs deep authenticated and unauthenticated vulnerability scanning.
- **Nmap**: Conducts initial tactical discovery of the network perimeter.
- **Intelligence Feeds**: MISP, OTX, and AbuseIPDB provide real-time threat reputation data for every discovered IP.

## 4. Mission Persistence (Database)
A PostgreSQL database stores the entire tactical context:
- **Inventory**: Hosts, ports, and services.
- **Security Context**: CVEs, exploit availability, and severity levels.
- **Operative Identity**: Securely hashed user credentials and mission profiles.
