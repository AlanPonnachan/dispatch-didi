// frontend/src/App.tsx
import React, { useState, useEffect } from 'react';
import { LiveKitRoom, useVoiceAssistant, BarVisualizer, RoomAudioRenderer, useRoomContext } from '@livekit/components-react';
import '@livekit/components-styles';
import { Phone, Trash2, Activity, MessageSquare, Clock, TrendingDown, Info, BarChart2, RefreshCw } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState("");
  const [orderId, setOrderId] = useState("ORD1042");
  const [language, setLanguage] = useState("hi-IN");
  const [connected, setConnected] = useState(false);
  const [dashboardLogs, setDashboardLogs] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [chartView, setChartView] = useState<'volume' | 'financial'>('volume');


  const fetchLogs = () => {
    fetch("http://localhost:8000/api/exceptions")
      .then(res => res.json())
      .then(data => setDashboardLogs(Array.isArray(data) ? data : []))
      .catch(err => console.error("Failed to fetch logs", err));
  };

  useEffect(() => {
    fetchLogs(); // Initial load
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let isUnmounted = false;

    const connectWs = () => {
      ws = new WebSocket("ws://localhost:8000/ws/dashboard");
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "db_update") {
          // 🚨 FIX: Force a clean REST fetch whenever the DB changes!
          fetchLogs();
        } else if (msg.type === "customer_sms" || msg.type === "eta_update") {
          setLiveEvents(prev => [{...msg.data, type: msg.type, time: new Date().toLocaleTimeString()}, ...prev].slice(0, 5));
        }
      };
      ws.onclose = () => { if (!isUnmounted) setTimeout(connectWs, 2000); };
    };

    connectWs();
    return () => { isUnmounted = true; if (ws) ws.close(); };
  }, []);


  // Fetch initial data
  useEffect(() => {
    fetch("http://localhost:8000/api/exceptions")
      .then(res => res.json())
      .then(data => setDashboardLogs(Array.isArray(data) ? data : []));
  }, []);

  // WebSocket for live updates
  useEffect(() => {
    let ws: WebSocket;
    let isUnmounted = false;

    const connectWs = () => {
      ws = new WebSocket("ws://localhost:8000/ws/dashboard");
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "db_update") {
          // ULTIMATE SAFETY: Guarantee it is ALWAYS an array to prevent white screen crashes
          setDashboardLogs(Array.isArray(msg.data) ? msg.data : []);
        } else if (msg.type === "customer_sms" || msg.type === "eta_update") {
          setLiveEvents(prev => [{...msg.data, type: msg.type, time: new Date().toLocaleTimeString()}, ...prev].slice(0, 5));
        }
      };
      ws.onclose = () => { if (!isUnmounted) setTimeout(connectWs, 2000); };
    };

    connectWs();
    return () => { isUnmounted = true; if (ws) ws.close(); };
  }, []);

  const startCall = async () => {
    const res = await fetch(`http://localhost:8000/api/token?order_id=${orderId}&language=${language}`);
    const data = await res.json();
    setToken(data.token);
    setConnected(true);
  };

  const clearDatabase = async () => {
    await fetch("http://localhost:8000/api/clear-db", { method: "POST" });
    setLiveEvents([]);
    setDashboardLogs([]);
  };

  const resolveIssue = async (id: number) => {
    await fetch(`http://localhost:8000/api/resolve/${id}`, { method: "POST" });
  };

  // SAFE METRICS CALCULATION (Will never crash even if backend sends bad data)
  const safeLogs = Array.isArray(dashboardLogs) ? dashboardLogs : [];
  const autoResolved = safeLogs.filter(l => l.status === 'resolved_autonomously').length;
  const humanResolved = safeLogs.filter(l => l.status === 'resolved_by_human').length;
  const escalated = safeLogs.filter(l => l.status === 'escalated').length;
  const total = safeLogs.length;
  const aiSuccessRate = total > 0 ? Math.round((autoResolved / total) * 100) : 0;
  const moneySaved = autoResolved * 150; 
  const timeSaved = autoResolved * 12; 

  return (
    <div className="flex h-screen w-full bg-slate-100 p-4 gap-4 overflow-hidden">
      
      {/* LEFT: Partner App */}
      <div className="w-[350px] flex flex-col bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 shrink-0">
        <div className="bg-slate-900 text-white p-6 text-center shadow-md z-10 relative">
          <h2 className="text-xl font-bold tracking-wide"> Partner</h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">Active Delivery</p>
        </div>

        {!connected ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">
            <div className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-10">
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Order ID</label>
              <input 
                type="text"
                className="w-full text-lg font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-indigo-500 mb-4"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
              />
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Language</label>
              <select 
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-indigo-500"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="hi-IN">Hindi / Hinglish</option>
                <option value="en-IN">English</option>
                <option value="ml-IN">Malayalam</option>
                <option value="kn-IN">Kannada</option>
                <option value="ta-IN">Tamil</option>
              </select>
            </div>
            <button onClick={startCall} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full p-6 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all hover:scale-105 active:scale-95">
              <Phone size={36} className="animate-pulse" />
            </button>
            <p className="mt-6 text-sm font-bold text-slate-600">SOS / Dispatch Didi</p>
          </div>
        ) : (
          <LiveKitRoom token={token} serverUrl="ws://localhost:7880" connect={true} audio={true} onDisconnected={() => setConnected(false)} className="flex-1 flex flex-col bg-slate-900 text-white">
            <RoomAudioRenderer />
            <ActiveCallView />
          </LiveKitRoom>
        )}
      </div>

      {/* RIGHT: Ops Dashboard */}
      <div className="flex-1 flex flex-col min-w-0 gap-4">
        
        {/* Header */}
        <div className="flex justify-between items-center px-2">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Dispatch Control Tower</h1>
            <p className="text-sm text-slate-500 font-medium">Autonomous Exception Engine v2.0</p>
          </div>
          
          {/* 🚨 NEW: Added Refresh Button next to Reset Demo */}
          <div className="flex gap-2">
            <button onClick={fetchLogs} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm font-medium text-sm active:scale-95">
              <RefreshCw size={16} /><span>Refresh</span>
            </button>
            <button onClick={clearDatabase} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm font-medium text-sm active:scale-95">
              <Trash2 size={16} /><span>Reset Logs</span>
            </button>
          </div>
        </div>

        {/* Row 1: ROI Cards with Tooltips */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-sm relative overflow-visible group">
            <div className="flex justify-between items-start">
              <p className="text-indigo-200 text-sm font-bold uppercase tracking-wider mb-1">AI Resolution Rate</p>
              <Info size={16} className="text-indigo-300 cursor-help" />
            </div>
            <p className="text-4xl font-black">{aiSuccessRate}%</p>
            <Activity className="absolute right-4 bottom-4 text-indigo-400/50" size={48} />
            <div className="absolute top-12 left-0 w-64 bg-slate-800 text-xs text-white p-3 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl">
              <strong>Metric Definition:</strong><br/>Percentage of total exceptions handled entirely by AI without touching a human ops queue.
            </div>
          </div>
          
          <div className="bg-emerald-500 text-white p-5 rounded-2xl shadow-sm relative overflow-visible group">
            <div className="flex justify-between items-start">
              <p className="text-emerald-100 text-sm font-bold uppercase tracking-wider mb-1">Ops Money Saved</p>
              <Info size={16} className="text-emerald-200 cursor-help" />
            </div>
            <p className="text-4xl font-black">₹{moneySaved}</p>
            <TrendingDown className="absolute right-4 bottom-4 text-emerald-400/50" size={48} />
            <div className="absolute top-12 left-0 w-64 bg-slate-800 text-xs text-white p-3 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl">
              <strong>Calculation (₹150/ticket):</strong><br/>Based on standard Indian BPO cost-per-contact + driver opportunity cost (SLA breaches) for a manual 12-min resolution.
            </div>
          </div>

          <div className="bg-blue-500 text-white p-5 rounded-2xl shadow-sm relative overflow-visible group">
            <div className="flex justify-between items-start">
              <p className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-1">Ops Time Saved</p>
              <Info size={16} className="text-blue-200 cursor-help" />
            </div>
            <p className="text-4xl font-black">{timeSaved} <span className="text-xl">min</span></p>
            <Clock className="absolute right-4 bottom-4 text-blue-400/50" size={48} />
            <div className="absolute top-12 left-0 w-64 bg-slate-800 text-xs text-white p-3 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl">
              <strong>Calculation (12m/ticket):</strong><br/>Standard ops resolution: 4m hold + 3m context gathering + 3m verification + 2m execution.
            </div>
          </div>
        </div>

        {/* Row 2: Analytics Graph & Live Feed */}
        <div className="grid grid-cols-3 gap-4 h-48">
          
          {/* Dynamic CSS Graph */}
          <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col relative">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 size={18} className="text-slate-500" />
                <h3 className="text-sm font-bold text-slate-700 uppercase">Live Analytics</h3>
              </div>
              <select 
                className="text-xs bg-slate-50 border border-slate-200 rounded p-1.5 focus:outline-indigo-500 font-medium cursor-pointer"
                value={chartView}
                onChange={(e: any) => setChartView(e.target.value)}
              >
                <option value="volume">Exception Volume Mix</option>
                <option value="financial">Impact vs Escalations</option>
              </select>
            </div>
            
            {/* Pure Tailwind Chart Area */}
            <div className="flex-1 flex items-end gap-6 justify-around px-8 pb-2 h-full">
              {chartView === 'volume' ? (
                <>
                  <div className="flex flex-col items-center gap-2 group cursor-pointer w-full h-full justify-end">
                    <div className="w-16 bg-emerald-400 rounded-t-sm transition-all duration-500 relative" style={{ height: `${total ? Math.max((autoResolved/total)*100, 5) : 5}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100">{autoResolved}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase text-center">AI Resolved</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 group cursor-pointer w-full h-full justify-end">
                    <div className="w-16 bg-rose-400 rounded-t-sm transition-all duration-500 relative" style={{ height: `${total ? Math.max((escalated/total)*100, 5) : 5}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100">{escalated}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase text-center">Escalated</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 group cursor-pointer w-full h-full justify-end">
                    <div className="w-16 bg-blue-400 rounded-t-sm transition-all duration-500 relative" style={{ height: `${total ? Math.max((humanResolved/total)*100, 5) : 5}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100">{humanResolved}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase text-center">Ops Fixed</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-2 group cursor-pointer w-full h-full justify-end">
                    <div className="w-full max-w-[80px] bg-indigo-500 rounded-t-sm transition-all duration-500 relative" style={{ height: `${total ? Math.max((moneySaved/(total*150))*100, 5) : 5}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100">₹{moneySaved}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">₹ Saved</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 group cursor-pointer w-full h-full justify-end">
                    <div className="w-full max-w-[80px] bg-slate-300 rounded-t-sm transition-all duration-500 relative" style={{ height: `${total ? Math.max((escalated/total)*100, 5) : 5}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100">{escalated}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Human Load</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Live Customer Comms Feed */}
          <div className="col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="bg-slate-50 p-3 border-b border-slate-100 flex items-center gap-2">
              <MessageSquare size={14} className="text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-700 uppercase">Live Interventions</h3>
            </div>
            <div className="p-3 flex-1 flex flex-col gap-2 overflow-y-auto">
              {liveEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center mt-4">Waiting for AI orchestrations...</p>
              ) : liveEvents.map((evt, i) => (
                <div key={i} className="text-[11px] bg-slate-50 border border-slate-100 p-2 rounded-lg animate-in slide-in-from-right-4 fade-in">
                  <span className="font-bold text-slate-700 mr-2">{evt.time}</span>
                  <span className="font-mono text-indigo-600 bg-indigo-50 px-1 rounded mr-1">{evt.order}</span>
                  <span className="text-slate-600">
                    {evt.type === 'customer_sms' ? evt.msg : `ETA updated by ${evt.mins}m.`}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Database Table (Fixed Scrolling & Protected Array) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 shadow-sm z-10">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Order</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">Exception Details</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action Taken</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ops Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safeLogs.map((log: any, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4"><span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{log.order_id}</span></td>
                    <td className="p-4 text-sm font-medium text-slate-700">{log.reason}</td>
                    <td className="p-4"><span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">{log.action_taken}</span></td>
                    <td className="p-4 text-center">
                      {log.status === 'escalated' ? (
                        <button onClick={() => resolveIssue(log.id)} className="bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-600 transition-all shadow-sm shadow-rose-200 hover:shadow-md animate-pulse cursor-pointer">
                          Resolve Escalation
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${log.status === 'resolved_by_human' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                          <div className={`w-2 h-2 rounded-full ${log.status === 'resolved_by_human' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                          {log.status === 'resolved_by_human' ? 'Ops Resolved' : 'AI Resolved'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {safeLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">
                      Zero escalations. The fleet is running smoothly.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveCallView() {
  const { state, audioTrack } = useVoiceAssistant();
  const room = useRoomContext();
  
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 text-white overflow-hidden rounded-b-3xl">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500 via-transparent to-transparent"></div>
      
      <div className="h-32 w-full flex items-center justify-center mb-8 relative z-10">
        {audioTrack ? (
          <BarVisualizer state={state} barCount={7} trackRef={audioTrack} className="w-full h-24 text-emerald-400" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-slate-700">
            <div className="w-16 h-16 rounded-full bg-slate-700 animate-ping opacity-20 absolute"></div>
            <Phone className="text-slate-400" size={32} />
          </div>
        )}
      </div>
      
      <div className="text-center z-10 relative">
        <h3 className="text-2xl font-bold mb-2">Dispatch Didi</h3>
        <p className="text-sm font-medium px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-400">
          {state === 'connecting' ? 'Connecting to AI...' : state === 'listening' ? 'Listening...' : state === 'speaking' ? 'Didi is speaking...' : 'Connected'}
        </p>
      </div>
      
      <div className="mt-auto pt-8 w-full z-10 relative flex justify-center pb-6">
         <button onClick={() => room.disconnect()} className="bg-rose-500 hover:bg-rose-600 text-white rounded-full p-5 shadow-[0_0_20px_rgba(225,29,72,0.4)] flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95">
           <Phone size={28} className="rotate-[135deg]" />
         </button>
      </div>
    </div>
  );
}