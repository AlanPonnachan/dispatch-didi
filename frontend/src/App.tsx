// frontend/src/App.tsx
import React, { useState, useEffect } from 'react';
import { LiveKitRoom, useVoiceAssistant, BarVisualizer, RoomAudioRenderer, useRoomContext } from '@livekit/components-react';
import '@livekit/components-styles';
import { Phone, Trash2, Activity, MessageSquare, Clock, TrendingDown } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState("");
  const [orderId, setOrderId] = useState("ORD1042");
  const [language, setLanguage] = useState("hi-IN");
  const [connected, setConnected] = useState(false);
  const [dashboardLogs, setDashboardLogs] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]); // New: SMS/ETA Feed

  useEffect(() => {
    fetch("http://localhost:8000/api/exceptions")
      .then(res => res.json())
      .then(data => setDashboardLogs(data));
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let isUnmounted = false;

    const connectWs = () => {
      ws = new WebSocket("ws://localhost:8000/ws/dashboard");
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "db_update") {
          setDashboardLogs(msg.data);
        } else if (msg.type === "customer_sms" || msg.type === "eta_update") {
          // Add to live events feed
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
  };

  const resolveIssue = async (id: number) => {
    await fetch(`http://localhost:8000/api/resolve/${id}`, { method: "POST" });
  };

  const autoResolved = dashboardLogs.filter(l => l.status === 'resolved_autonomously').length;
  const humanResolved = dashboardLogs.filter(l => l.status === 'resolved_by_human').length;
  const escalated = dashboardLogs.filter(l => l.status === 'escalated').length;
  
  // IMPACT METRICS (The "Game Up" ROI Data)
  const total = dashboardLogs.length;
  const aiSuccessRate = total > 0 ? Math.round((autoResolved / total) * 100) : 0;
  const moneySaved = autoResolved * 150; // Assume 150 INR saved in ops time per AI resolution
  const timeSaved = autoResolved * 12; // Assume 12 mins saved per ticket

  return (
    <div className="flex h-screen w-full bg-slate-100 p-4 gap-4 overflow-hidden">
      
      {/* LEFT: Partner App */}
      <div className="w-[350px] flex flex-col bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
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
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4 px-2">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Dispatch Control Tower</h1>
            <p className="text-sm text-slate-500 font-medium">Autonomous Exception Engine v2.0</p>
          </div>
          <button onClick={clearDatabase} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm font-medium text-sm">
            <Trash2 size={16} /><span>Reset Logs</span>
          </button>
        </div>

        {/* Top Widgets: ROI & Live Feed */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          
          {/* ROI Cards */}
          <div className="col-span-3 grid grid-cols-3 gap-4">
            <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
              <p className="text-indigo-200 text-sm font-bold uppercase tracking-wider mb-1">AI Resolution Rate</p>
              <p className="text-4xl font-black">{aiSuccessRate}%</p>
              <Activity className="absolute right-4 bottom-4 text-indigo-400/50" size={48} />
            </div>
            <div className="bg-emerald-500 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
              <p className="text-emerald-100 text-sm font-bold uppercase tracking-wider mb-1">Ops Money Saved</p>
              <p className="text-4xl font-black">₹{moneySaved}</p>
              <TrendingDown className="absolute right-4 bottom-4 text-emerald-400/50" size={48} />
            </div>
            <div className="bg-blue-500 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
              <p className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-1">Ops Time Saved</p>
              <p className="text-4xl font-black">{timeSaved} <span className="text-xl">min</span></p>
              <Clock className="absolute right-4 bottom-4 text-blue-400/50" size={48} />
            </div>
          </div>

          {/* NEW: Live Customer Comms Feed */}
          <div className="col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="bg-slate-50 p-3 border-b border-slate-100 flex items-center gap-2">
              <MessageSquare size={16} className="text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-700 uppercase">Live Customer SMS</h3>
            </div>
            <div className="p-3 flex-1 flex flex-col gap-2 overflow-y-auto">
              {liveEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center mt-4">Waiting for AI orchestrations...</p>
              ) : liveEvents.map((evt, i) => (
                <div key={i} className="text-[11px] bg-slate-50 border border-slate-100 p-2 rounded-lg animate-in slide-in-from-right-4 fade-in">
                  <span className="font-bold text-slate-700 mr-2">{evt.time}</span>
                  <span className="font-mono text-indigo-600 bg-indigo-50 px-1 rounded mr-1">{evt.order}</span>
                  <span className="text-slate-600">
                    {evt.type === 'customer_sms' ? evt.msg : `ETA extended by ${evt.mins} mins.`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Database Table (Fixed Scrolling) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 shadow-sm z-10">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Order</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">Exception Details (AI Extracted)</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action Taken</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ops Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboardLogs.map((log: any, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{log.order_id}</span>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-700">{log.reason}</td>
                    <td className="p-4">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                        {log.action_taken}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {log.status === 'escalated' ? (
                        <button 
                          onClick={() => resolveIssue(log.id)}
                          className="bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-600 transition-all shadow-sm shadow-rose-200 hover:shadow-md cursor-pointer animate-pulse"
                        >
                          Resolve Escalation
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
                          log.status === 'resolved_by_human' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${log.status === 'resolved_by_human' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                          {log.status === 'resolved_by_human' ? 'Ops Resolved' : 'AI Resolved'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
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
  const room = useRoomContext(); // Gives us direct control to disconnect

  return (
    // Force a true absolute dark background to override any LiveKit default themes
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 text-white overflow-hidden rounded-b-2xl">
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
         {/* Custom Bulletproof Hang Up Button */}
         <button 
           onClick={() => room.disconnect()} 
           className="bg-rose-500 hover:bg-rose-600 text-white rounded-full p-5 shadow-[0_0_20px_rgba(225,29,72,0.4)] flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95"
         >
           <Phone size={28} className="rotate-[135deg]" />
         </button>
      </div>
    </div>
  );
}