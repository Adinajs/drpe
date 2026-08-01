# DRPE: Dynamic Risk Posture Evaluation - User Manual

## 1. Introduction
The Dynamic Risk Posture Evaluation (DRPE) platform is an AI-driven security intelligence system designed to unify network reconnaissance, vulnerability management, and real-time risk assessment. This manual provides instructions for system administrators and security operators on how to deploy and use the platform.

## 2. Installation & Deployment

### 2.1 Prerequisites
- **Docker & Docker Compose**: Installed on the host machine (Windows/Linux/macOS).
- **Kali Linux Agent**: A separate instance (VM or Physical) with OpenVAS (GVM) installed and SSH access enabled.
- **API Keys**: 
    - Google Gemini API Key (for AI Copilot)
    - AlienVault OTX API Key
    - AbuseIPDB API Key

### 2.2 Quick Start
1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-repo/drpe.git
    cd drpe
    ```
2.  **Configure Environment**:
    Edit the `backend/.env` file with your credentials:
    ```env
    GOOGLE_API_KEY=your_gemini_key
    OTX_API_KEY=your_otx_key
    ABUSEIPDB_API_KEY=your_abuse_key
    GVM_HOST=your_kali_ip
    GVM_USER=your_ssh_user
    GVM_PASSWORD=your_ssh_password
    ```
3.  **Launch Containers**:
    ```bash
    docker-compose up -d
    ```
4.  **Access the UI**:
    Open your browser and navigate to `http://localhost:81`.

## 3. Getting Started

### 3.1 Account Creation
Upon first access, navigate to the **Sign Up** page. Create an administrative account with your email and a strong password. Once registered, log in to access the **Mission Control Dashboard**.

### 3.2 Dashboard Overview
The Dashboard provides a high-level view of your enterprise security posture:
- **Enterprise Risk Score**: A unified 0–100 score representing overall risk.
- **Severity Distribution**: A breakdown of vulnerabilities by severity level.
- **Live Event Feed**: Real-time logs of system activities and scan progress.
- **Risk Heatmap**: Visual representation of asset risk distribution.

## 4. Core Operations

### 4.1 Asset Discovery
To discover hosts on your network:
1.  Navigate to the **Assets** page.
2.  Click **Discover Assets**.
3.  Enter the target network range (e.g., `192.168.1.0/24`).
4.  Select scan flags (default: `-sV -O -T4`).
5.  Click **Initiate Discovery**. Results will populate the assets table automatically.

### 4.2 Vulnerability Scanning
To perform a deep scan on a discovered asset:
1.  In the **Assets** table, click the **Scan** icon next to an IP address.
2.  Select a scan profile (e.g., `Full and Fast`).
3.  Monitor the progress in the **Scans** page. The system will automatically fetch and parse results once the scan is complete.

### 4.3 AI Tactical Copilot
The AI Copilot provides contextual analysis of findings:
1.  Open the **AI Copilot** panel from the sidebar.
2.  Ask questions like: *"What is the impact of CVE-2021-44228 on my network?"* or *"How do I remediate the OpenSSL vulnerability on host 10.0.0.5?"*
3.  The AI will provide streaming, natural-language guidance based on your live scan data.

### 4.4 Risk Management
- **Asset Criticality**: Edit an asset to assign its business criticality (Critical, High, Medium, Low). This directly influences the risk score.
- **Threat Intelligence**: View the **Threat Intel** page to see real-time reputation data for your assets from OTX and AbuseIPDB.

## 5. Maintenance & Reporting

### 5.1 Posture Snapshots
The system takes daily snapshots of your security posture. You can view historical trends in the **Snapshots** section to track improvement over time.

### 5.2 Generating Reports
1.  Navigate to the **Reports** page.
2.  Select an asset or the entire organization.
3.  Click **Generate PDF**. The system will produce a professional dossier including risk breakdowns and remediation steps.

---
*© 2026 DRPE Project Team*
