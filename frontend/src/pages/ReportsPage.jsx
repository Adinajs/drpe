import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { 
  FileText, 
  Download, 
  ChevronRight, 
  ShieldAlert, 
  Calendar,
  Layers,
  Activity,
  AlertTriangle,
  Server,
  Zap,
  BarChart3,
  Loader2,
  Table as TableIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '../utils/cn';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

const ReportsPage = () => {
  const [searchParams] = useSearchParams();
  const targetIp = searchParams.get('ip');
  
  const [summary, setSummary] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (targetIp) {
        const response = await api.getReportData(targetIp);
        setSummary(response.data);
      } else {
        const [sumRes, forRes] = await Promise.all([
          api.getDashboardSummary(),
          api.getRiskForecast()
        ]);
        setSummary(sumRes.data);
        setForecast(forRes.data);
      }
    } catch (error) {
      toast.error('Mission Telemetry Feed Lost: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [targetIp]);
  

  const handleExportExecutivePDF = () => {
    const doc = new jsPDF();
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm');
    const filename = `DRPE_Executive_Report_${format(new Date(), 'yyyyMMdd')}.pdf`;

    // Branding Header
    doc.setFillColor(255, 255, 255); // White bg
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(0, 0, 0); // Black text
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('DRPE EXECUTIVE INTELLIGENCE', 15, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('CONFIDENTIAL SECURITY ADVISORY', 15, 26);
    doc.text(`Generated: ${timestamp}`, 15, 32);

    // Summary Section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(targetIp ? `Asset Information: ${targetIp}` : 'Environment Summary', 15, 55);

    const summaryBody = targetIp ? [
      ['Node Address', targetIp, 'IDENTIFIED'],
      ['Hostname', summary?.asset?.hostname || 'N/A', 'MAPPED'],
      ['Risk Score', summary?.risk?.score || '0.0', summary?.risk?.level || 'LOW'],
      ['Vulnerabilities', summary?.total_vulnerabilities || '0', 'ACTION REQUIRED'],
    ] : [
      ['Enterprise Risk Score', summary?.enterprise_risk_score || 'N/A', (summary?.enterprise_risk_score > 70 ? 'CRITICAL' : 'STABLE')],
      ['Total Assets Discovered', summary?.total_assets || '0', 'ACTIVE'],
      ['Critical Vulnerabilities', summary?.severity_breakdown?.Critical || '0', 'ACTION REQUIRED'],
      ['Predictive Trend (7D)', (forecast?.trend_metadata?.projected_7d_change > 0 ? 'RISING' : 'STABLE'), (forecast?.trend_metadata?.breach_probability || 'LOW')],
    ];

    autoTable(doc, {
      startY: 60,
      head: [['Metric', 'Value', 'Status']],
      body: summaryBody,
      theme: 'grid',
      headStyles: { fillStyle: 'red', fillColor: [99, 102, 241] },
    });

    // Asset Detailed Profile
    if (targetIp && summary?.asset) {
       doc.setFontSize(14);
       doc.text('Hardware & OS Profile', 15, doc.lastAutoTable.finalY + 15);
       autoTable(doc, {
         startY: doc.lastAutoTable.finalY + 20,
         head: [['Property', 'Intelligence']],
         body: [
            ['OS Detected', summary.asset.os_detected || 'Unknown'],
            ['MAC Address', summary.asset.mac_address || 'Unknown'],
            ['Criticality', summary.asset.criticality || 'Medium'],
         ],
         theme: 'striped'
       });
    }

    // Forecast Section (Global Only)
    if (!targetIp && forecast?.forecast) {
      doc.setFontSize(14);
      doc.text('Risk Trend Forecast', 15, doc.lastAutoTable.finalY + 15);
      
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Date', 'Predicted Risk Score', 'Probability Impact']],
        body: forecast.forecast.map(p => [
          new Date(p.date).toLocaleDateString(),
          p.score,
          p.score > 70 ? 'CRITICAL' : p.score > 40 ? 'HIGH' : 'MODERATE'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });
    }

    // Top Risky Assets / Vulnerabilities
    doc.setFontSize(14);
    if (targetIp) {
      doc.text('Key Vulnerabilities Identified', 15, doc.lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['CVE ID', 'Name', 'Severity', 'Score']],
        body: (summary?.vulnerabilities || []).slice(0, 15).map(v => [
          v.cve_id || 'N/A', 
          (v.name.length > 50 ? v.name.substring(0, 47) + '...' : v.name),
          v.severity,
          v.cvss_score || 'N/A'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] },
      });
    } else {
      doc.text('Critical Exposure Nodes', 15, doc.lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['IP Address', 'Hostname', 'Risk Score', 'Level']],
        body: summary?.top_risky_assets?.map(a => [a.ip, a.hostname || 'N/A', a.score, a.level]) || [],
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] },
      });
    }

    // Recommendations
    const finalY = doc.lastAutoTable.finalY + 15;
    if (finalY < 250) {
      doc.setFontSize(14);
      doc.text('Recommended Actions', 15, finalY);
      doc.setFontSize(10);
      doc.text(`1. Initiate remediation on ${targetIp ? 'this node' : 'Critical segments'} identified in the dossiers.`, 15, finalY + 10);
      doc.text('2. Update firewall policies to block high-threat IP signatures.', 15, finalY + 16);
      doc.text('3. Run continuous scans on newly discovered assets.', 15, finalY + 22);
    }

    // Footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('DRPE Platform v2.0 - Automated Security Intelligence Portfolio', 15, 285);

    doc.save(filename);
    toast.success('Executive Report Generated Successfully');
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    
    setIsExporting(true);
    const toastId = toast.loading('Generating Compact Security Report...');
    
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, 
        useCORS: true,
        logging: false,
        backgroundColor: null,
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const imgWidth = 210; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [imgWidth, imgHeight]
      });
      
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
      
      const cleanIp = targetIp ? targetIp.replace(/\./g, '-') : '';
      const filename = targetIp ? `DRPE_Report_${cleanIp}_${format(new Date(), 'yyyyMMdd')}.pdf` : `DRPE_Security_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      
      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      
      // Standard Download Flow
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 500);
      
      toast.success('Report Exported to Downloads.', { id: toastId });
      setIsExporting(false);
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error('Mission Failed: Could not compile report.', { id: toastId });
      setIsExporting(false);
    }
   };

  const Section = ({ title, icon: Icon, children }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Icon className="w-4 h-4 text-indigo-600" />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );

  // Map summary data based on whether it's global or IP-specific
  const stats = (targetIp && summary?.risk) ? [
    { label: 'Risk Score', value: summary?.risk?.score, sub: 'NODE CALCULATION', icon: BarChart3, color: 'text-indigo-brand-500' },
    { label: 'Threat Score', value: summary?.threat_intel?.composite_score, sub: 'EXT INTELLIGENCE', icon: ShieldAlert, color: 'text-foreground' },
    { label: 'Vulnerabilities', value: summary?.total_vulnerabilities, sub: 'IDENTIFIED RISKS', icon: AlertTriangle, color: 'text-status-high' },
    { label: 'Exploitable', value: summary?.exploitable_count, sub: 'CRITICAL THREATS', icon: Zap, color: 'text-status-critical' },
  ] : [
    { label: 'Risk Score', value: summary?.enterprise_risk_score, sub: 'ENVIRONMENT AVG', icon: BarChart3, color: 'text-indigo-brand-500' },
    { label: 'Asset Count', value: summary?.total_assets, sub: 'ACTIVE NODES', icon: Server, color: 'text-foreground' },
    { label: 'Total Vulns', value: summary?.total_vulnerabilities, sub: 'RAW CVE COUNT', icon: AlertTriangle, color: 'text-status-high' },
    { label: 'Criticality', value: summary?.severity_breakdown?.Critical, sub: 'HIGH IMPACT', icon: Zap, color: 'text-status-critical' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-brand-500/10 rounded-2xl border border-indigo-brand-500/20">
            <FileText className="w-6 h-6 text-indigo-brand-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono uppercase tracking-tight">
              {targetIp ? `Asset Dossier: ${targetIp}` : 'Overall Posture Evaluation'}
            </h1>
            <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase">
              {targetIp ? 'Target-Specific Security Intelligence' : 'Global Mission Infrastructure Summary'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
              onClick={handleExportPDF}
              disabled={isExporting || loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-brand-600 hover:bg-indigo-brand-500 text-white font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
           >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export PDF
           </button>
           <button 
              onClick={handleExportExecutivePDF}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-indigo-500/30 hover:border-indigo-500 text-indigo-400 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
           >
              <BarChart3 className="w-4 h-4" />
              Executive Report
           </button>
        </div>
      </div>

      {loading ? (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4 animate-in fade-in duration-700">
          <Loader2 className="w-8 h-8 text-indigo-brand-500 animate-spin" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
            {targetIp ? `Analyzing Node ${targetIp}...` : 'Compiling Field Intelligence...'}
          </p>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card text-foreground rounded-xl p-12 shadow-2xl relative overflow-hidden border border-border report-render-container"
          ref={reportRef}
        >
        {/* Background Accents (Hidden in Print) */}
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none print:hidden">
          <ShieldAlert className="w-96 h-96 text-indigo-brand-500 rotate-12" />
        </div>
        <div className="absolute inset-0 cyber-grid opacity-[0.03] pointer-events-none print:hidden"></div>

        {/* Report Content */}
        <div className="relative z-10 space-y-12">
          {/* Cover Section */}
          <div className="flex justify-between items-start border-b-2 border-indigo-brand-500 pb-10 mb-6">
            <div className="space-y-6">
               <div className="flex items-center gap-4">
                  <div className="p-2.5 bg-indigo-brand-600 rounded-xl shadow-lg shadow-indigo-brand-500/20">
                    <ShieldAlert className="text-white w-9 h-9" />
                  </div>
                  <div className="space-y-0.5">
                    <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase leading-none">DRPE SECURITY</h2>
                    <p className="text-[10px] font-black text-indigo-brand-500 tracking-[0.4em] uppercase">X-Threat Intelligence Pipeline</p>
                  </div>
               </div>
               <div className="pt-4 border-t border-border">
                 <h4 className="text-2xl font-black text-foreground tracking-tight mb-1">
                   {targetIp ? `Tactical Intelligence Dossier: ${targetIp}` : 'Enterprise Integrity Posture Report'}
                 </h4>
                 <p className="text-xs font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-widest">
                   <Calendar className="w-3.5 h-3.5 text-indigo-brand-500" />
                   Timestamp: {format(new Date(), 'MMMM dd, yyyy @ HH:mm:ss')}
                 </p>
               </div>
            </div>
            <div className="text-right flex flex-col items-end gap-2 pt-2">
              <div className="px-3 py-1 bg-indigo-brand-500/5 border border-indigo-brand-500/20 rounded text-[9px] font-black text-indigo-brand-500 uppercase tracking-[0.2em]">
                Status: Verified Intelligence
              </div>
              <p className="text-[10px] font-mono font-bold text-muted-foreground">
                REF_ID: {targetIp ? `N-${targetIp.split('.').join('')}-${format(new Date(), 'HHmm')}` : `R-${format(new Date(), 'yyyyMMdd')}-X`}
              </p>
            </div>
          </div>

          {/* Infrastructure Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</span>
                </div>
                <p className={cn("text-3xl font-black", stat.color)}>{stat.value || '0'}</p>
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-tighter">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Asset Info for specific IP */}
          {targetIp && summary?.asset && (
            <Section title="Asset Identification Intelligence" icon={Server}>
              <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-sm bg-muted/20 p-6 rounded-xl border border-border">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-medium">Hostname:</span>
                  <span className="font-bold text-foreground uppercase">{summary.asset.hostname || 'UNDEFINED'}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-medium">OS Platform:</span>
                  <span className="font-bold text-foreground uppercase">{summary.asset.os_detected || 'UNKNOWN'}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-medium">MAC Address:</span>
                  <span className="font-bold font-mono text-foreground">{summary.asset.mac_address || '00:00:00:00:00:00'}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-medium">Criticality:</span>
                  <span className="font-bold text-indigo-brand-500 uppercase">{summary.asset.criticality}</span>
                </div>
              </div>
            </Section>
          )}

          <Section title="Vulnerability Profile Distribution" icon={Layers}>
             <div className="bg-muted/30 border border-border rounded-xl p-6 grid grid-cols-4 gap-6">
               {['Critical', 'High', 'Medium', 'Low'].map(sev => (
                 <div key={sev} className="text-center group">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{sev}</p>
                    <p className={cn(
                      "text-2xl font-black",
                      sev === 'Critical' ? "text-status-critical" :
                      sev === 'High' ? "text-status-high" :
                      sev === 'Medium' ? "text-status-medium" : "text-status-safe"
                    )}>
                      {summary?.severity_breakdown?.[sev] || 0}
                    </p>
                    <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden border border-border">
                      <div 
                        className={cn(
                          "h-full animate-in slide-in-from-left duration-1000",
                          sev === 'Critical' ? "bg-status-critical" :
                          sev === 'High' ? "bg-status-high" :
                          sev === 'Medium' ? "bg-status-medium" : "bg-status-safe"
                        )}
                        style={{ width: `${(summary?.severity_breakdown?.[sev] || 0) / (summary?.total_vulnerabilities || 1) * 100}%` }}
                      ></div>
                    </div>
                 </div>
               ))}
             </div>
          </Section>

          {/* Vulnerability List for specific IP */}
          {targetIp && summary?.vulnerabilities?.length > 0 && (
            <Section title="Identified Vulnerability Timeline" icon={TableIcon}>
              <div className="overflow-hidden border border-border rounded-xl bg-muted/10 divide-y divide-border">
                {summary.vulnerabilities.slice(0, 10).map((vuln, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        vuln.severity === 'Critical' ? "bg-status-critical animate-pulse" : 
                        vuln.severity === 'High' ? "bg-status-high" : "bg-status-medium"
                      )} />
                      <div>
                        <p className="text-sm font-bold text-foreground">{vuln.name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                          {vuln.cve_id || 'LOCAL_ID'} | CVSS {vuln.cvss_score || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-[10px] font-black px-2 py-0.5 rounded border uppercase", 
                        vuln.severity === 'Critical' ? "text-status-critical border-status-critical/20 bg-status-critical/10" : 
                        vuln.severity === 'High' ? "text-status-high border-status-high/20 bg-status-high/10" : "text-muted-foreground border-border bg-muted/20"
                      )}>
                        {vuln.severity}
                      </div>
                    </div>
                  </div>
                ))}
                {summary.vulnerabilities.length > 10 && (
                  <div className="p-3 text-center bg-muted/20">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">
                      + {summary.vulnerabilities.length - 10} Additional Vulnerabilities Omitted from Preview
                    </p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {!targetIp && (
            <Section title="High Risk Intelligence Nodes" icon={Server}>
              <div className="overflow-hidden border border-border rounded-xl bg-muted/10 divide-y divide-border">
                {summary?.top_risky_assets?.map((asset, i) => (
                  <div key={i} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-status-critical animate-pulse" />
                      <div>
                        <p className="text-sm font-bold text-foreground">{asset.ip}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{asset.hostname || 'UNDEFINED_NODE'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-base font-black px-2 py-0.5 rounded border", 
                        asset.level === 'Critical' ? "text-status-critical border-status-critical/20 bg-status-critical/10" : "text-status-high border-status-high/20 bg-status-high/10"
                      )}>
                        {asset.level} ({asset.score})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recommendations and Next Steps Placeholder */}
          <Section title="AI Recommended Remediation Ops" icon={Zap}>
             <div className="space-y-4">
               {[
                 { action: 'Critical Patch Deployment', desc: `Apply immediate updates to ${targetIp || 'identified critical assets'} specifically focusing on kernel-level CVE mitigation.`, prio: 'URGENT' },
                 { action: 'Network Isolation', desc: 'Isolate segment from external traffic if suspicious scanning signatures persist.', prio: 'CRITICAL' },
                 { action: 'Threat Intel Sync', desc: 'Run manual OTX synchronization to update IP reputation blacklist for the perimeter firewall.', prio: 'ROUTINE' },
               ].map((rec, i) => (
                 <div key={i} className="p-4 bg-muted/20 border border-border rounded-xl flex items-start gap-4">
                   <div className="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center shrink-0">
                      <ChevronRight className="w-4 h-4 text-indigo-brand-500" />
                   </div>
                   <div>
                     <div className="flex items-center gap-3">
                       <p className="text-sm font-bold text-foreground">{rec.action}</p>
                       <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border", 
                          rec.prio === 'URGENT' ? "bg-status-critical/10 text-status-critical border-status-critical/20" : "bg-indigo-brand-500/10 text-indigo-brand-500 border-indigo-brand-500/20"
                       )}>{rec.prio}</span>
                     </div>
                     <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rec.desc}</p>
                   </div>
                 </div>
               ))}
             </div>
          </Section>

          {/* Report Footer */}
          <div className="pt-12 border-t-2 border-border flex justify-between items-end opacity-50">
            <div className="text-[10px] font-black uppercase tracking-widest">
              X-Cyber Analytics Operation v2.0
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em]">
              Authorized_Personnel_Only
            </div>
          </div>
        </div>
      </motion.div>
    )}
    </div>
  );
};

export default ReportsPage;
