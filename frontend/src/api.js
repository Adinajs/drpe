import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor for Auth & Custom Keys
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('drpe_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Pass Intel keys from localStorage if they exist
    const otxKey = localStorage.getItem('drpe_otx_api_key');
    const abuseKey = localStorage.getItem('drpe_abuse_api_key');
    const ollamaModel = localStorage.getItem('drpe_ollama_model');

    if (otxKey) config.headers['X-OTX-Key'] = otxKey;
    if (abuseKey) config.headers['X-Abuse-Key'] = abuseKey;
    if (ollamaModel) config.headers['X-Ollama-Model'] = ollamaModel;

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor for Errors
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'Mission Communication Failure';
    return Promise.reject(new Error(message));
  }
);

export const api = {
  // ── Authentication ──────────────────────────────────────────
  login(credentials) {
    return apiClient.post('/api/auth/login', credentials);
  },

  signup(userData) {
    return apiClient.post('/api/auth/signup', userData);
  },

  logout() {
    localStorage.removeItem('drpe_token');
    localStorage.removeItem('drpe_user');
  },

  // ── Asset Discovery ──────────────────────────────────────────
  discoverAssets(target, flags) {
    return apiClient.post('/api/discover-assets', { target, flags });
  },

  // ── Assets ───────────────────────────────────────────────────
  getAssets({ criticality, status, limit = 10000, offset = 0 } = {}) {
    return apiClient.get('/api/assets', { params: { criticality, status, limit, offset } });
  },

  getAsset(id) {
    return apiClient.get(`/api/assets/${id}`);
  },

  updateAsset(id, updates) {
    return apiClient.patch(`/api/assets/${id}`, updates);
  },

  // ── Scanning ─────────────────────────────────────────────────
  startScan(assetIp, scanName) {
    return apiClient.post('/api/start-scan', { asset_ip: assetIp, scan_name: scanName });
  },

  checkScanStatus(scanId) {
    return apiClient.get(`/api/scans/${scanId}/status`);
  },

  listScans({ assetId, status, limit = 50 } = {}) {
    return apiClient.get('/api/scans', { params: { asset_id: assetId, status, limit } });
  },

  fetchScanResults(scanId) {
    return apiClient.post(`/api/fetch-scan-results/${scanId}`);
  },

  // ── Vulnerabilities ──────────────────────────────────────────
  getVulnerabilities({ assetId, severity, limit = 100 } = {}) {
    return apiClient.get('/api/vulnerabilities', { params: { asset_id: assetId, severity, limit } });
  },

  analyzeVulnerability(vulnId) {
    return apiClient.post('/api/ai/analyze-vulnerability', { vuln_id: vulnId });
  },

  // ── Dashboard ────────────────────────────────────────────────
  getDashboardSummary()    { return apiClient.get(`/api/dashboard-summary?_t=${Date.now()}`); },
  getRiskHeatmap()         { return apiClient.get('/api/risk-heatmap'); },
  getTrendData(days = 30)  { return apiClient.get('/api/trend-data', { params: { days } }); },
  getThreatIntelSummary()  { return apiClient.get('/api/threat-intel-summary', { params: { limit: 20 } }); },
  fetchThreatIntel()       { return apiClient.post('/api/fetch-threat-intel'); },
  getReportData(ip)        { return apiClient.get(`/api/report-data/${ip}`); },
  getGlobalAdvisories()    { return apiClient.get('/api/global-advisories'); },
  getIntelDiagnostics()    { return apiClient.get('/api/intel-diagnostics'); },

  // ── Risk ─────────────────────────────────────────────────────
  calculateRisk(assetId) {
    return apiClient.post('/api/calculate-risk', null, { params: { asset_id: assetId } });
  },

  // ── Health ───────────────────────────────────────────────────
  health() { return apiClient.get('/api/health'); },
  getScannerHealth() { return apiClient.get('/api/scanner-health'); },
  getRiskForecast()  { return apiClient.get('/api/risk-forecast'); },
  getNetworkTopology() { return apiClient.get('/api/network-topology'); },
  takePostureSnapshot() { return apiClient.post('/api/posture-snapshot'); },
  triggerMissionScan() { return apiClient.post('/api/mission/trigger'); },
  getAdminTokens() { return apiClient.get('/api/admin/tokens'); }
};
