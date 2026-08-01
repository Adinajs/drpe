import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { toast } from 'react-hot-toast';

export const useDashboardData = () => {
  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem('drpe_dashboard_cache');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error('Failed to parse cached dashboard data', e);
    }
    return {
      summary: null,
      trend: null,
      heatmap: null,
      threats: null,
      forecast: null,
    };
  });

  const [loading, setLoading] = useState(() => {
    // Avoid showing the skeleton/spinner if we already have valid cached data
    try {
      const cached = localStorage.getItem('drpe_dashboard_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.summary && parsed.trend && parsed.heatmap) {
          return false;
        }
      }
    } catch (e) {}
    return true;
  });

  const [error, setError] = useState(null);
  const prevScansRef = useRef([]);

  // Initialize prevScansRef with cached data to prevent duplicate completion toasts on mount
  useEffect(() => {
    if (data?.summary?.recent_scans) {
      prevScansRef.current = data.summary.recent_scans;
    }
  }, []);

  const fetchAll = async (isSilent = false) => {
    // Only show the loading state if we have no cached data at all
    const hasData = data.summary && data.trend && data.heatmap;
    if (!isSilent && !hasData) {
      setLoading(true);
    }

    try {
      const [summaryRes, trendRes, heatmapRes, threatsRes, forecastRes] = await Promise.all([
        api.getDashboardSummary(),
        api.getTrendData(14),
        api.getRiskHeatmap(),
        api.getThreatIntelSummary(),
        api.getRiskForecast(),
      ]);

      const newData = { 
        summary: summaryRes.data, 
        trend: trendRes.data, 
        heatmap: heatmapRes.data, 
        threats: threatsRes.data,
        forecast: forecastRes.data
      };

      // Notification Logic: Detect scan completion
      if (summaryRes.data?.recent_scans) {
        const currentScans = summaryRes.data.recent_scans;
        
        currentScans.forEach(scan => {
          const prevScan = prevScansRef.current.find(ps => ps.id === scan.id);
          // If a scan was 'running' and is now 'completed'
          if (prevScan && prevScan.status === 'running' && scan.status === 'completed') {
            toast.success(`Mission Update: Scan "${scan.name}" on ${scan.target} is complete! Analysis compiled.`, {
              duration: 4000,
              icon: '🛡️'
            });
          }
        });
        
        prevScansRef.current = currentScans;
      }

      setData(newData);
      localStorage.setItem('drpe_dashboard_cache', JSON.stringify(newData));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll(true); // Silent revalidation on mount
    
    // Set up polling interval for background updates (15 seconds)
    const intervalId = setInterval(() => {
      fetchAll(true); // Silent update
    }, 15000);

    return () => clearInterval(intervalId);
  }, []);

  return { ...data, loading, error, refresh: () => fetchAll() };
};
