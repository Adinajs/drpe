import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

# Define custom NumberedCanvas to handle headers and footers with a two-pass system
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # We suppress headers and footers on the first page (Cover Page)
        if self._pageNumber == 1:
            # Draw beautiful side geometric bars on cover page
            self.setFillColor(colors.HexColor("#0f766e")) # Teal
            self.rect(0, 0, 18, 792, fill=1, stroke=0)
            self.setFillColor(colors.HexColor("#1e293b")) # Slate
            self.rect(18, 0, 8, 792, fill=1, stroke=0)
            self.restoreState()
            return
            
        # Draw Header
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0f766e")) # Teal primary accent
        self.drawString(54, 745, "DYNAMIC RISK POSTURE EVALUATION (DRPE)")
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#475569")) # Charcoal
        self.drawRightString(558, 745, "TECHNICAL PRODUCT DOCUMENT")
        
        # Header divider line
        self.setStrokeColor(colors.HexColor("#cbd5e1")) # Slate-300
        self.setLineWidth(0.5)
        self.line(54, 737, 558, 737)
        
        # Draw Footer
        self.line(54, 55, 558, 55)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b")) # Slate-500
        self.drawString(54, 40, "CONFIDENTIAL  |  CYBERSECURITY INTELLIGENCE PLATFORM")
        
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 40, page_text)
        
        self.restoreState()

def build_pdf(filename="DRPE_Technical_Product_Document.pdf"):
    # 1. Page Template Setup
    # letter is 8.5 x 11 inches (612 x 792 points)
    # Margins: 0.75 inch = 54 points left/right; 1 inch = 72 points top/bottom
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=72,
        bottomMargin=72
    )
    
    styles = getSampleStyleSheet()
    
    # 2. Custom Typography and Color System
    primary_color = colors.HexColor("#0f172a") # Slate 900
    accent_color = colors.HexColor("#0f766e")  # Teal 700
    text_color = colors.HexColor("#334155")    # Slate 700
    bg_light = colors.HexColor("#f8fafc")      # Slate 50
    border_color = colors.HexColor("#e2e8f0")  # Slate 200
    
    # Create unique Paragraph Styles
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        textColor=primary_color,
        spaceAfter=15
    )
    
    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=primary_color,
        spaceBefore=18,
        spaceAfter=10,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=accent_color,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14.5,
        textColor=text_color,
        spaceAfter=8
    )
    
    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14.5,
        textColor=text_color,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=5
    )
    
    code_style = ParagraphStyle(
        'Code_Custom',
        parent=styles['Code'],
        fontName='Courier',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
        backColor=bg_light,
        borderColor=border_color,
        borderWidth=0.5,
        borderPadding=6,
        spaceAfter=10,
        spaceBefore=5
    )
    
    callout_style = ParagraphStyle(
        'Callout_Custom',
        parent=body_style,
        fontName='Helvetica-Oblique',
        textColor=colors.HexColor("#0f766e"),
        backColor=colors.HexColor("#f0fdf4"),
        borderColor=colors.HexColor("#bbf7d0"),
        borderWidth=0.5,
        borderPadding=8,
        spaceAfter=10,
        spaceBefore=5
    )
    
    story = []
    
    # ==========================================
    # COVER PAGE (Super Clean & Human-designed)
    # ==========================================
    story.append(Spacer(1, 220))
    story.append(Paragraph("DYNAMIC RISK POSTURE EVALUATION USING AUTOMATED THREAT INTELLIGENCE", title_style))
    story.append(Spacer(1, 10))
    
    # Elegant minimal accent bar below title
    d_table = Table([[""]], colWidths=[120])
    d_table.setStyle(TableStyle([
        ('LINEABOVE', (0,0), (-1,-1), 3.0, accent_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(d_table)
    story.append(PageBreak())
    
    # ==========================================
    # 1. PRODUCT OVERVIEW
    # ==========================================
    story.append(Paragraph("1. Product Overview", h1_style))
    story.append(Paragraph(
        "<b>DRPE (Dynamic Risk Posture Evaluation Using Automated Threat Intelligence)</b> is a next-generation "
        "cybersecurity intelligence platform that provides autonomous network reconnaissance, vulnerability management, "
        "real-time threat intelligence correlation, and predictive composite risk scoring from a single, unified interface. "
        "The product consolidates traditionally fragmented security operations (including asset discovery, vulnerability scanning, "
        "threat intelligence gathering, risk assessment, and AI-assisted analysis) into a single <b>Mission Control Dashboard</b>.",
        body_style
    ))
    story.append(Paragraph(
        "DRPE is designed for security operators, enterprise security teams, and system administrators who require "
        "continuous, automated visibility into their organization's security posture without juggling multiple disconnected tools. "
        "The platform follows an API-first architecture built on <b>FastAPI (Python)</b> for the backend and <b>React (Vite)</b> "
        "for the frontend, orchestrated through Docker Compose for consistent, scalable deployment. It integrates with "
        "industry-standard security engines (Nmap, OpenVAS/GVM) and aggregated threat intelligence feeds (AlienVault OTX, "
        "AbuseIPDB, SANS Internet Storm Center, and a localized MISP synchronization service). It features a highly advanced "
        "AI Tactical Copilot powered by Google Gemini or a localized Ollama instance (DeepSeek-R1) for intelligent, context-grounded "
        "remediation analysis.",
        body_style
    ))
    
    # ==========================================
    # 2. PRODUCT PURPOSE & PROBLEM STATEMENT
    # ==========================================
    story.append(Paragraph("2. Product Purpose and Problem Statement", h1_style))
    story.append(Paragraph(
        "Modern enterprise security environments suffer from extreme toolchain fragmentation. Operational teams spend "
        "significant time switching between asset databases, scanner dashboards, threat intelligence feeds, and manual risk spreadsheets. "
        "Vulnerabilities are assessed in isolation without correlation to external IP reputation data or business criticality. "
        "DRPE natively bridges these gaps.",
        body_style
    ))
    
    # Comparison Table
    table_data = [
        [Paragraph("<b>Fragmented Cybersecurity Challenges</b>", body_style), Paragraph("<b>The Unified DRPE Solution</b>", body_style)],
        [Paragraph("• Scattered asset inventory and untracked systems", bullet_style), Paragraph("• Automated Nmap-based active asset discovery and classification", bullet_style)],
        [Paragraph("• Manual, periodic vulnerability scans", bullet_style), Paragraph("• Automated remote OpenVAS scans via secure SSH tunneling", bullet_style)],
        [Paragraph("• Threat intelligence disconnected from internal CVEs", bullet_style), Paragraph("• Live correlation with OTX, AbuseIPDB, MISP, SANS ISC", bullet_style)],
        [Paragraph("• Subjective or static risk scoring spreadsheets", bullet_style), Paragraph("• Neural Risk Engine calculating composite, context-weighted risk", bullet_style)],
        [Paragraph("• Lack of intelligent, contextual remediation", bullet_style), Paragraph("• Grounded AI Tactical Copilot (Gemini/Ollama) with streaming recommendations", bullet_style)],
        [Paragraph("• Static reporting and zero trend awareness", bullet_style), Paragraph("• Client-side PDF generation and linear regression risk forecasting", bullet_style)]
    ]
    
    comp_table = Table(table_data, colWidths=[240, 264])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (1,0), colors.HexColor("#f1f5f9")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
    ]))
    story.append(comp_table)
    story.append(Spacer(1, 10))
    
    # ==========================================
    # 3. CORE FEATURES
    # ==========================================
    story.append(Paragraph("3. Core Features", h1_style))
    
    story.append(Paragraph("3.1 Autonomous Asset Discovery", h2_style))
    story.append(Paragraph(
        "DRPE leverages a localized Nmap engine (via `python-nmap`) to perform autonomous network-wide reconnaissance. "
        "The system scans operator-defined CIDR ranges to identify live hosts, resolve hostnames, detect operating systems, "
        "and enumerate open ports with full service-version detection. Discovered nodes are persisted to the database and assigned "
        "an intelligent, automatic criticality rating (Critical, High, Medium, Low) based on exposed services (e.g., database and RDP ports "
        "are prioritized) and operating system types, which operators can manually reclassify.",
        body_style
    ))
    
    story.append(Paragraph("3.2 Deep Vulnerability Scanning", h2_style))
    story.append(Paragraph(
        "Deep vulnerability scanning is performed through remote Greenbone Vulnerability Management (OpenVAS/GVM) engines "
        "deployed on a dedicated Kali Linux target host. DRPE communicates securely with the Kali scanner via an SSH tunnel "
        "(managed via `Paramiko`). The orchestrator issues XML requests via `gvm-cli` over a Unix socket (`gvmd.sock`), "
        "manages task life-cycles, and leverages a background polling thread (running every 60 seconds) to detect scan completion, "
        "automatically fetch, parse, and synchronize XML reports back to the PostgreSQL database.",
        body_style
    ))
    
    story.append(Paragraph("3.3 Threat Intelligence Integration", h2_style))
    story.append(Paragraph(
        "DRPE enriches scanned assets with real-time, external threat intelligence from four major feeds:",
        body_style
    ))
    story.append(Paragraph("• <b>AlienVault OTX:</b> Ingests active malware indicators, threat tags, adversary tracking, and IP pulse counts.", bullet_style))
    story.append(Paragraph("• <b>AbuseIPDB:</b> Retrieves IP reputation, abuse reports, confidence ratings, ISP metadata, and country origins.", bullet_style))
    story.append(Paragraph("• <b>MISP (Malware Information Sharing Platform):</b> Dynamically synchronizes localized open-source indicator lists.", bullet_style))
    story.append(Paragraph("• <b>SANS Internet Storm Center:</b> Fetches global threat level indicators and operational headlines.", bullet_style))
    
    story.append(PageBreak())
    
    # Neural Risk Engine Section (With Corrections!)
    story.append(Paragraph("3.4 Neural Risk Engine", h2_style))
    story.append(Paragraph(
        "Unlike generic platforms, DRPE features an advanced composite risk scoring algorithm that models the complete "
        "threat surface of each individual asset and the organization as a whole.",
        body_style
    ))
    
    # Formulas block
    formulas = """
    <b>Asset-Level Risk Equations:</b><br/>
    1. Vulnerability Score Component (weighted CVSS aggregate):<br/>
       <i>vulnerability_score = SUM( CVSS_score x exploit_multiplier ) x criticality_weight</i><br/>
    2. Threat Intelligence Component (scaled out of 30 max points):<br/>
       <i>threat_score = ( composite_threat_intel_score / 100.0 ) x 30.0</i><br/>
    3. Total Raw Risk Score:<br/>
       <i>raw_risk_score = vulnerability_score + threat_score</i><br/>
    4. Normalized Score (0-100 scale, dynamic ceiling):<br/>
       <i>normalized_score = MIN( ( raw_risk_score / ceiling ) x 100.0, 100.0 )</i>
    """
    story.append(Paragraph(formulas, code_style))
    
    # Callout about correct dynamic ceiling and Weighted Peak Average
    story.append(Paragraph(
        "<b>[TECHNICAL AUDIT NOTE — SCORING CALIBRATION]:</b><br/>"
        "1. <b>Dynamic Ceiling Calculation:</b> To prevent a single medium vulnerability from inflating an asset's score to 100%, "
        "the normalization ceiling scales dynamically with the number of vulnerabilities found: "
        "<i>ceiling = max(len(vulns) * 10 * 1.5 * 3.0, 45.0) + 30.0</i>. This ensures the normalized risk accurately represents "
        "the node's defensive posture relative to the quantity of active threats.<br/>"
        "2. <b>Weighted Peak Average (Enterprise Score):</b> The global enterprise risk is not calculated as a standard average, "
        "which would dangerously dilute critical risks across large inventories. Instead, the engine uses a <b>Weighted Peak Average</b>:<br/>"
        "<i>Enterprise Risk = ( Max Asset Risk x 0.7 ) + ( Average Asset Risk x 0.3 )</i><br/>"
        "This ensures that a single high-risk asset forces the overall posture rating to remain elevated, alerting system operators immediately.",
        callout_style
    ))
    
    # Param tables
    param_data = [
        [Paragraph("<b>Parameter</b>", body_style), Paragraph("<b>Operational Range & Weights</b>", body_style)],
        [Paragraph("Asset Criticality Weight", body_style), Paragraph("Critical = 3.0, High = 2.0, Medium = 1.5, Low = 1.0", body_style)],
        [Paragraph("Exploit Multiplier", body_style), Paragraph("1.5x if public exploit exists (e.g. Metasploit/EDB), 1.0x otherwise", body_style)],
        [Paragraph("Threat Intel Scale", body_style), Paragraph("Contributes up to 30.0 points to the raw score", body_style)],
        [Paragraph("Normalizing Ceiling", body_style), Paragraph("Dynamic (calculated as <i>max_vuln_ceiling + 30.0</i>, min 75.0)", body_style)]
    ]
    param_table = Table(param_data, colWidths=[150, 354])
    param_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f8fafc")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(param_table)
    story.append(Spacer(1, 10))
    
    # 3.5 - 3.9 Features
    story.append(Paragraph("3.5 AI Tactical Copilot", h2_style))
    story.append(Paragraph(
        "DRPE natively integrates an <b>AI Tactical Copilot</b> powered by either the Google Gemini API or a locally deployed "
        "Ollama instance running <code>deepseek-r1:1.5b</code> (customizable via backend environment variables). "
        "The copilot runs context-grounded queries: when an operator initiates a chat or clicks on a specific vulnerability, "
        "the backend compiles the live database records (host IP, open ports, CVE details, CVSS vector, and solutions) "
        "and injects them directly into the LLM system prompt. This ensures all analysis is highly contextualized, "
        "accurate, and provides actionable remediation guidance. Response chunks are streamed back via Server-Sent Events (SSE) "
        "for instant UI response.",
        body_style
    ))
    
    story.append(Paragraph("3.6 Dashboard and Topology Visualization", h2_style))
    story.append(Paragraph(
        "The React-based Mission Control dashboard presents key metrics visually, featuring an enterprise risk trend line, "
        "vulnerability criticality distributions, and an interactive, force-directed network topology graph (using `react-force-graph-2d`). "
        "Nodes represent discovered assets, sized according to their individual risk scores and colored by severity (Red = Critical, "
        "Orange = High, Yellow = Medium, Green = Low). Links automatically form between assets belonging to the same subnet, "
        "enabling rapid visual profiling of subnet risk concentration and lateral movement vulnerability.",
        body_style
    ))
    
    # ==========================================
    # 4. SUB-TOOLS & INTEGRATED COMPONENTS
    # ==========================================
    story.append(Paragraph("4. Sub-Tools and Integrated Components", h1_style))
    story.append(Paragraph(
        "The DRPE platform unifies specialized, industry-proven security utilities into a cohesive ecosystem.",
        body_style
    ))
    
    sub_data = [
        [Paragraph("<b>Component</b>", body_style), Paragraph("<b>Operational Purpose</b>", body_style), Paragraph("<b>Integration Interface</b>", body_style)],
        [Paragraph("Nmap", body_style), Paragraph("Active asset discovery, port enumeration, OS detection", body_style), Paragraph("Subprocess execution via <code>python-nmap</code>", body_style)],
        [Paragraph("OpenVAS/GVM", body_style), Paragraph("Deep vulnerability scanning and CVE mapping", body_style), Paragraph("Remote execution via SSH Tunneling (Paramiko) to Kali Host using <code>gvm-cli</code>", body_style)],
        [Paragraph("Google Gemini", body_style), Paragraph("Cloud-based AI remediation and analysis copilot", body_style), Paragraph("HTTPS REST API using <code>google-generativeai</code> SDK", body_style)],
        [Paragraph("Ollama", body_style), Paragraph("Self-hosted, offline LLM alternative (DeepSeek-R1)", body_style), Paragraph("Local HTTP loopback on port 11434 (or container networking)", body_style)],
        [Paragraph("Threat Feeds", body_style), Paragraph("Reputation scoring, abuse history, threat tagging", body_style), Paragraph("REST APIs with exponential backoff retry logic (Tenacity)", body_style)]
    ]
    sub_table = Table(sub_data, colWidths=[110, 194, 200])
    sub_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(sub_table)
    story.append(PageBreak())
    
    # ==========================================
    # 5. SYSTEM ARCHITECTURE
    # ==========================================
    story.append(Paragraph("5. System Architecture", h1_style))
    story.append(Paragraph(
        "DRPE uses a decoupled, three-tier architecture orchestrated via Docker Compose. The client React application "
        "interacts with the asynchronous FastAPI backend via CORS-restricted, JWT-authenticated REST APIs. "
        "The backend handles database transactions with PostgreSQL, spawns automated scans via SSH to the scanning node, "
        "and manages real-time streaming interfaces for the AI Tactical Copilot.",
        body_style
    ))
    
    # Text-based architecture diagram
    arch_diagram = """
    +=====================================================================+
    |                         DRPE PLATFORM ARCHITECTURE                  |
    +=====================================================================+
    |                                                                     |
    |   +-------------------+    REST / JWT    +---------------------+    |
    |   |   FRONTEND        | <--------------> |   BACKEND           |    |
    |   |   React 18 / Vite |    (Port 81)     |   FastAPI / Uvicorn |    |
    |   |                   |                  |   (Port 8000)       |    |
    |   +-------------------+                  +---------+-----------+    |
    |                                                    |                |
    |              +-------------------------------------+--------+       |
    |              |                |                |            |       |
    |              v                v                v            v       |
    |   +----------------+  +-------------+  +-----------+  +---------+  |
    |   |  PostgreSQL 15 |  | Orchestrator|  | AI Engine |  | External|  |
    |   |  Database      |  | APScheduler |  | Gemini /  |  | APIs    |  |
    |   |  (Port 5432)   |  | background  |  | Ollama    |  | OTX,    |  |
    |   +----------------+  +-------------+  +-----------+  | Abuse   |  |
    |                                                       +---------+  |
    |                                                                     |
    +===========================+=========================================+
                                |
                                | Secure Paramiko SSH Tunnel (Port 22)
                                v
                      +--------------------+
                      |  KALI LINUX HOST   |
                      |  OpenVAS / GVM     |
                      |  gvmd.sock         |
                      +--------------------+
    """
    story.append(Paragraph(arch_diagram.replace(" ", "&nbsp;").replace("\n", "<br/>"), code_style))
    
    story.append(Paragraph("5.3 Database Schema Specifications", h2_style))
    story.append(Paragraph(
        "DRPE leverages **PostgreSQL 15** with customized indexing, GIN query optimizations, and database views "
        "to ensure high-performance analytics.",
        body_style
    ))
    
    db_data = [
        [Paragraph("<b>Table</b>", body_style), Paragraph("<b>Operational Purpose</b>", body_style), Paragraph("<b>Key Optimization / Fields</b>", body_style)],
        [Paragraph("<code>assets</code>", body_style), Paragraph("Monitored network nodes", body_style), Paragraph("INET address uniqueness, JSONB open ports", body_style)],
        [Paragraph("<code>scans</code>", body_style), Paragraph("Vulnerability scanning jobs", body_style), Paragraph("B-tree indexes on scan status and foreign keys", body_style)],
        [Paragraph("<code>vulnerabilities</code>", body_style), Paragraph("Parsed vulnerability findings", body_style), Paragraph("GIN trgm index on CVE ID, CVSS score indexing", body_style)],
        [Paragraph("<code>threat_intel</code>", body_style), Paragraph("Reputation feed records", body_style), Paragraph("Unique composite index on (asset_id, fetched_at DESC)", body_style)],
        [Paragraph("<code>risk_scores</code>", body_style), Paragraph("Historical calculations", body_style), Paragraph("JSONB details for historical formula audits", body_style)],
        [Paragraph("<code>posture_history</code>", body_style), Paragraph("Daily security state snaps", body_style), Paragraph("Unique index on snapshot date, B-tree risk scores", body_style)],
        [Paragraph("<code>users</code>", body_style), Paragraph("Operator account credentials", body_style), Paragraph("Bcrypt password hashing, email uniqueness", body_style)],
        [Paragraph("<code>api_tokens</code>", body_style), Paragraph("Programmatic access tokens", body_style), Paragraph("SHA-256 hashed static token authorization", body_style)],
        [Paragraph("<code>scan_schedules</code>", body_style), Paragraph("Scheduled scanning tasks", body_style), Paragraph("Active flag, CRON expression, date trackers", body_style)]
    ]
    db_table = Table(db_data, colWidths=[100, 164, 240])
    db_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f8fafc")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(db_table)
    
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<b>Note on Database Views:</b> The schema incorporates two optimized views:<br/>"
        "1. <code>v_current_risk</code>: Dynamically resolves the absolute latest risk score and threat indicators for each asset.<br/>"
        "2. <code>v_dashboard_summary</code>: Pre-aggregates core dashboard counters (total active assets, vulnerabilities, average CVSS) "
        "via a LATERAL join to minimize latency on dashboard load.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # ==========================================
    # 6. TECHNOLOGY STACK
    # ==========================================
    story.append(Paragraph("6. Technology Stack", h1_style))
    
    tech_data = [
        [Paragraph("<b>Component Layer</b>", body_style), Paragraph("<b>Framework / Technology</b>", body_style), Paragraph("<b>Operational Scope</b>", body_style)],
        [Paragraph("Backend", body_style), Paragraph("FastAPI 0.111.0, Python 3.10+, asyncpg", body_style), Paragraph("Asynchronous REST endpoints & database interface", body_style)],
        [Paragraph("ORM", body_style), Paragraph("SQLAlchemy 2.0.35+", body_style), Paragraph("Database abstraction and async query execution", body_style)],
        [Paragraph("Scheduler", body_style), Paragraph("APScheduler 3.10.4", body_style), Paragraph("Background task orchestration and cron operations", body_style)],
        [Paragraph("SSH Tunneling", body_style), Paragraph("Paramiko 3.4.0", body_style), Paragraph("Secure tunnel creation to target remote scanners", body_style)],
        [Paragraph("Frontend UI", body_style), Paragraph("React 18.2.0, Vite 5.0.0, TailwindCSS", body_style), Paragraph("Component-based, responsive, modular dashboard", body_style)],
        [Paragraph("Data Viz", body_style), Paragraph("Recharts 2.15.4, react-force-graph-2d", body_style), Paragraph("High-fidelity posture graphs & network topology", body_style)],
        [Paragraph("PDF Generation", body_style), Paragraph("jsPDF 4.2.1, jspdf-autotable", body_style), Paragraph("Client-side technical report generation", body_style)]
    ]
    tech_table = Table(tech_data, colWidths=[100, 184, 220])
    tech_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(tech_table)
    story.append(Spacer(1, 10))
    
    # ==========================================
    # 7. PERFORMANCE & SPECIFICATIONS
    # ==========================================
    story.append(Paragraph("7. Capacity and Performance Specifications", h1_style))
    story.append(Paragraph(
        "The system has been engineered to support enterprise networks ranging from **100 to 5,000 active nodes** per instance.",
        body_style
    ))
    
    spec_data = [
        [Paragraph("<b>Performance Metric</b>", body_style), Paragraph("<b>Standard Measurement / Specification</b>", body_style)],
        [Paragraph("Monitored Asset Capacity", body_style), Paragraph("Up to 5,000 devices per backend instance", body_style)],
        [Paragraph("Database Connection Pool", body_style), Paragraph("50 base connections (100 max overflow), 30-min recycle", body_style)],
        [Paragraph("Subnet Discovery Timing", body_style), Paragraph("1 to 5 minutes for a full /24 CIDR range using Nmap", body_style)],
        [Paragraph("Threat Intel Ingestion", body_style), Paragraph("2 to 10 seconds per IP, utilizing async parallel queries", body_style)],
        [Paragraph("Vulnerability Scan Timing", body_style), Paragraph("15 to 60 minutes per host (varies by scanner profile depth)", body_style)],
        [Paragraph("Global Posture Snaps", body_style), Paragraph("Synchronized after scan completed; can run manually or on Cron", body_style)]
    ]
    spec_table = Table(spec_data, colWidths=[180, 324])
    spec_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f8fafc")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(spec_table)
    story.append(Spacer(1, 10))
    
    # ==========================================
    # 8. AGENT-BASED VS AGENTLESS DESIGN
    # ==========================================
    story.append(Paragraph("8. Agent-Based vs Agentless Design", h1_style))
    story.append(Paragraph(
        "DRPE utilizes a **hybrid agentless scanning model** combined with an **autonomous backend control agent**.",
        body_style
    ))
    story.append(Paragraph(
        "Unlike enterprise systems requiring invasive software agents to be deployed on every endpoint, "
        "DRPE performs all scans externally over network interfaces. Nmap conducts packet probes to discover ports and OS variants, "
        "while GVM issues GMP requests to test for active vulnerability signatures. This approach guarantees "
        "zero deployment footprint on monitored machines, bypasses operating system compatibility barriers, and extends scanning "
        "eligibility to network equipment, IoT controllers, and industrial printers.",
        body_style
    ))
    
    # ==========================================
    # 9. SECURITY & DEPLOYMENT MODELS
    # ==========================================
    story.append(Paragraph("9. Security Model", h1_style))
    story.append(Paragraph("• <b>Authentication:</b> Controlled via strict JWT session authorization tokens with 24-hour expiration times. Supports static SHA-256 hashed API tokens for script interfaces.", bullet_style))
    story.append(Paragraph("• <b>Communication:</b> Frontend-to-backend REST connections are CORS-protected and JWT-authenticated. Connections to the Kali Linux scanner travel over an SSH tunnel utilizing Paramiko key-based authorization.", bullet_style))
    story.append(Paragraph("• <b>Audit Logging:</b> Critical security actions (sign-ups, asset modifications, scan dispatching) are logged to the <code>activity_logs</code> table with detail maps and operator stamps.", bullet_style))
    
    story.append(Spacer(1, 10))
    story.append(Paragraph("10. Deployment Model", h1_style))
    story.append(Paragraph(
        "DRPE deploys seamlessly as an orchestrated multi-container suite via **Docker Compose**. The standard stack includes:<br/>"
        "1. <b>PostgreSQL 15</b> (Database Layer: port 5432)<br/>"
        "2. <b>FastAPI</b> (Asynchronous Backend Server: port 8000)<br/>"
        "3. <b>React / Vite</b> (Interactive Frontend UI: port 81)<br/>"
        "4. <b>Ollama</b> (Optional Local LLM: port 11434)<br/>"
        "This makes installation highly portable across Windows, macOS, and Linux servers, requiring only a SSH link to the Kali scanner.",
        body_style
    ))
    
    # 3. Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Technical Product Document successfully compiled to: {filename}")

if __name__ == "__main__":
    build_pdf()
