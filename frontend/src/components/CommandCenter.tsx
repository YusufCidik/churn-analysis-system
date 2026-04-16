"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceArea,
} from "recharts";

type CustomerRecord = {
  id: number;
  customer_unique_id: string;
  churn_probability: number;
  predicted_clv: number;
  risk_segment: string;
  action_plan: string | null;
  ai_commentary: string | null;
  last_updated?: string | null;
  customer: Record<string, any>;
  assigned_to_id?: number | null;
};

type UserRecord = {
  id: number;
  username: string;
  role: string;
};

type SimulateResponseV1 = {
  baseline_churn_probability: number;
  new_churn_probability: number;
  delta_probability: number;
  delta_percent: number;
  baseline_risk_segment: string;
  new_risk_segment: string;
  action_plan_after: string;
  ai_commentary_after: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080";

function riskIsCritical(prob: number) {
  return prob >= 0.52;
}

function formatPct(p: number) {
  if (!Number.isFinite(p)) return "0.00";
  return (p * 100).toFixed(2);
}

function formatMoney(v: number) {
  if (!Number.isFinite(v)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export default function CommandCenter() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [discountPercent, setDiscountPercent] = useState(10);
  const [contractValue, setContractValue] = useState("Month-to-month");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulateResponseV1 | null>(null);
  const [simError, setSimError] = useState<string>("");

  // Demo Role Logic
  const [role, setRole] = useState<"admin" | "employee">("admin");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/customers?limit=1000`);
      if (!res.ok) throw new Error("Failed to fetch customers");
      const list = await res.json();
      setCustomers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`);
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error("Failed to fetch users", e);
    }
  }, []);

  useEffect(() => {
    void fetchCustomers();
    void fetchUsers();
  }, [fetchCustomers, fetchUsers]);

  const clvMedian = useMemo(() => {
    if (customers.length === 0) return 0;
    const sorted = customers
      .map((c) => c.predicted_clv)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }, [customers]);

  const stats = useMemo(() => {
    const criticalCount = customers.filter((c) => riskIsCritical(c.churn_probability)).length;
    const totalCLVAtRisk = customers
      .filter((c) => riskIsCritical(c.churn_probability))
      .reduce((acc, c) => acc + (c.predicted_clv || 0), 0);

    return {
      criticalCount,
      totalCLVAtRisk,
      avgCLV: customers.reduce((acc, c) => acc + (c.predicted_clv || 0), 0) / (customers.length || 1),
    };
  }, [customers]);

  const simulate = useCallback(async () => {
    if (!selected) return;
    setSimLoading(true);
    setSimError("");
    try {
      const modifiedCustomer = { ...selected.customer, Contract: contractValue };
      const res = await fetch(`${API_BASE}/api/v1/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: modifiedCustomer,
          monthly_discount_percent: discountPercent,
        }),
      });
      if (!res.ok) throw new Error("Simulation failed");
      setSimResult(await res.json());
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Simulation error");
    } finally {
      setSimLoading(false);
    }
  }, [selected, discountPercent, contractValue]);

  useEffect(() => {
    if (drawerOpen && selected) {
      void simulate();
    }
  }, [drawerOpen, selected, simulate]);

  const handleAssign = async (userId: number) => {
    if (!selected) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/customers/${selected.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setCustomers((prev) =>
          prev.map((c) => (c.id === selected.id ? { ...c, assigned_to_id: userId } : c))
        );
      }
    } catch (e) {
      console.error("Assignment failed", e);
    }
  };

  const scatterData = useMemo(() => {
    return customers.map((c) => ({
      ...c,
      x: c.churn_probability,
      y: c.predicted_clv,
    }));
  }, [customers]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as CustomerRecord;
      return (
        <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-lg backdrop-blur-md shadow-2xl text-white">
          <p className="font-bold text-cyan-400">{data.customer_unique_id}</p>
          <p className="text-xs">Risk: {formatPct(data.churn_probability)}%</p>
          <p className="text-xs">CLV: {formatMoney(data.predicted_clv)}</p>
          <p className="text-[10px] text-slate-500 mt-1 uppercase">Click to open side-drawer</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-cyan-500/30 font-sans">
      {/* Navbar / Strategic Header */}
      <nav className="sticky top-0 z-40 w-full border-b border-white/5 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="font-black text-white text-lg">T</span>
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg">Trinity Intelligence</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-none">SaaS Retention Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-900/50 p-1 rounded-full border border-white/5">
              <button
                onClick={() => setRole("admin")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                  role === "admin" ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30" : "text-slate-400 hover:text-white"
                }`}
              >
                Admin
              </button>
              <button
                onClick={() => setRole("employee")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                  role === "employee" ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30" : "text-slate-400 hover:text-white"
                }`}
              >
                Employee
              </button>
            </div>
            <label className="cursor-pointer bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/10 transition-all text-xs font-medium">
              Upload Analysis
              <input type="file" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append("file", file);
                await fetch(`${API_BASE}/api/v1/analyze-file`, { method: "POST", body: formData });
                fetchCustomers();
              }} />
            </label>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading && (
          <div className="fixed top-20 right-8 z-50 flex items-center gap-3 bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded-full border border-cyan-500/30 animate-pulse backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
            <span className="text-[10px] font-black uppercase">Syncing Intelligence...</span>
          </div>
        )}

        {/* KPI Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <KPICard
            label="Total Financial Risk"
            value={formatMoney(stats.totalCLVAtRisk)}
            subtext={`${stats.criticalCount} At-risk customers`}
            color="rose"
            icon={<RiskIcon />}
          />
          <KPICard
            label="Average Lifecycle Value"
            value={formatMoney(stats.avgCLV)}
            subtext="Per unique identifier"
            color="cyan"
            icon={<CLVIcon />}
          />
          <KPICard
            label="Analyzed Cohort"
            value={customers.length.toString()}
            subtext="Active accounts in database"
            color="blue"
            icon={<CohortIcon />}
          />
        </div>

        {/* Priority Matrix Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-slate-900/30 border border-white/5 rounded-3xl p-6 backdrop-blur-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 blur-[100px] -mr-32 -mt-32 rounded-full pointer-events-none group-hover:bg-cyan-500/20 transition-all duration-700" />
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold">Priority Matrix</h2>
                <p className="text-sm text-slate-400">Churn Risk (X) vs Projected CLV (Y)</p>
              </div>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase font-bold bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Critical Zone
                </span>
              </div>
            </div>

            <div className="h-[450px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff01" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Risk"
                    unit="%"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    domain={[0, 1]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="CLV"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    tickFormatter={(v) => `$${v / 1000}k`}
                  />
                  <ZAxis type="number" range={[100, 100]} />
                  <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#22d3ee" }} />

                  {/* High Value / High Risk Reference Area */}
                  <ReferenceArea
                    x1={0.52}
                    y1={clvMedian}
                    x2={1}
                    y2={Math.max(...customers.map(c => c.predicted_clv), clvMedian * 2) || clvMedian * 2}
                    fill="url(#criticalGradient)"
                    fillOpacity={0.15}
                  />

                  <defs>
                    <linearGradient id="criticalGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <Scatter
                    name="Customers"
                    data={scatterData}
                    onClick={(data) => {
                      setSelected(data);
                      setDrawerOpen(true);
                    }}
                  >
                    {scatterData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={riskIsCritical(entry.churn_probability) ? "#f43f5e" : "#0ea5e9"}
                        className={`cursor-pointer transition-all duration-300 hover:scale-[3] ${
                          riskIsCritical(entry.churn_probability) && entry.predicted_clv > clvMedian ? "drop-shadow-[0_0_8px_rgba(244,63,94,1)] animate-pulse" : ""
                        }`}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-8 text-[10px] font-black uppercase tracking-[3px] text-slate-600">
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> Retention Safe</span>
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Intervention Needed</span>
            </div>
          </div>

          <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full border-t border-t-rose-500/20">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Critical Portfolio</h2>
                <p className="text-sm text-slate-400">High-priority intervention list</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                <RiskIcon size={20} />
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[480px] pr-2 scrollbar-none">
              {customers
                .filter((c) => riskIsCritical(c.churn_probability))
                .sort((a, b) => b.predicted_clv - a.predicted_clv)
                .slice(0, 50)
                .map((customer) => (
                  <CustomerListItem
                    key={customer.id}
                    customer={customer}
                    onSelect={() => {
                      setSelected(customer);
                      setDrawerOpen(true);
                    }}
                  />
                ))}
              {customers.filter(c => riskIsCritical(c.churn_probability)).length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                  <div className="w-12 h-12 border-2 border-dashed border-slate-500 rounded-full flex items-center justify-center mb-4">
                    <CohortIcon size={24} />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest">No Critical Risks Found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Intelligence Side Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.customer_unique_id || "Customer Deep-Dive"}
      >
        {selected && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950 rounded-2xl p-5 border border-white/5 relative overflow-hidden group">
                <div className={`absolute inset-0 bg-gradient-to-br opacity-5 ${riskIsCritical(selected.churn_probability) ? "from-rose-500 to-transparent" : "from-cyan-500 to-transparent"}`} />
                <p className="text-[10px] text-slate-500 uppercase font-black mb-1 relative underline decoration-rose-500/30">Risk Probability</p>
                <p className={`text-3xl font-black relative ${riskIsCritical(selected.churn_probability) ? "text-rose-500" : "text-cyan-400"}`}>
                  {formatPct(selected.churn_probability)}%
                </p>
              </div>
              <div className="bg-slate-950 rounded-2xl p-5 border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-5" />
                <p className="text-[10px] text-slate-500 uppercase font-black mb-1 relative">Predicted CLV</p>
                <p className="text-3xl font-black text-white relative">{formatMoney(selected.predicted_clv)}</p>
              </div>
            </div>

            {/* Admin Assignment Section */}
            {role === "admin" && (
              <div className="p-6 bg-cyan-500/5 border border-cyan-500/10 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <AssignIcon size={64} />
                </div>
                <h3 className="text-xs font-black flex items-center gap-2 mb-4 text-cyan-300 uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" /> Admin Command: Delegate Task
                </h3>
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">Assign this risk portfolio to an account manager for immediate tactical outreach.</p>
                  <select
                    className="w-full bg-[#020617] border border-white/10 rounded-2xl px-4 py-4 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all font-bold hover:border-cyan-500/30 cursor-pointer"
                    value={selected.assigned_to_id || ""}
                    onChange={(e) => handleAssign(Number(e.target.value))}
                  >
                    <option value="">-- Unassigned Intelligence --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>Manager: {u.username} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* AI Commentary */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] flex items-center gap-2">
                <AIIcon size={16} /> Intelligence Summary
              </h3>
              <div className="bg-slate-900/30 p-6 rounded-[2.5rem] border border-white/5 text-sm leading-relaxed text-slate-300 relative border-l-2 border-l-cyan-500/50">
                <div className="absolute top-0 left-0 p-4 opacity-5">
                  <AIIcon size={40} />
                </div>
                <p className="relative z-10 font-medium">"{selected.ai_commentary || "Model is processing additional behavioral signals for this profile."}"</p>
              </div>
            </div>

            {/* Simulation Block */}
            <div className="space-y-8 pt-8 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] flex items-center gap-2">
                  <SimulateIcon size={16} /> What-If Simulator
                </h3>
                <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-3 py-1 rounded-full border border-cyan-500/20 font-black">Live Edge Compute</span>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold tracking-tight">Tactical Discount</label>
                    <span className="text-xs font-black text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-lg">-{discountPercent}% ARPU Impact</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    className="w-full h-2 bg-slate-900 rounded-full appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 px-1 uppercase tracking-tighter">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold tracking-tight">Contract Conversion</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Month-to-month", "One year", "Two year"].map((term) => (
                      <button
                        key={term}
                        onClick={() => setContractValue(term)}
                        className={`py-3 px-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          contractValue === term ? "bg-cyan-500 text-white border-cyan-400 shadow-xl shadow-cyan-500/20" : "bg-slate-900 text-slate-500 border-white/5 hover:border-white/20"
                        }`}
                      >
                        {term.split("-")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-8 rounded-[3rem] transition-all duration-700 relative overflow-hidden group ${
                  simLoading ? "opacity-50" : "opacity-100"
                } ${simResult && simResult.new_churn_probability < simResult.baseline_churn_probability ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-900/50 border border-white/5"}`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                  {simLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-4">
                      <div className="w-8 h-8 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                      <span className="text-[10px] font-black uppercase tracking-[4px] text-cyan-500 animate-pulse">Running Trinity...</span>
                    </div>
                  ) : (
                    simResult && (
                      <div className="space-y-8 relative z-10">
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[10px] uppercase font-black text-slate-500 mb-2 tracking-widest">Optimized Risk Rating</p>
                            <p className={`text-6xl font-black tracking-tighter ${riskIsCritical(simResult.new_churn_probability) ? "text-rose-500" : "text-emerald-400"}`}>
                              {formatPct(simResult.new_churn_probability)}<span className="text-2xl font-bold opacity-50">%</span>
                            </p>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 mb-2">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m19 12-7 7-7-7"/><path d="M12 19V5"/></svg> REDUCED
                            </div>
                            <p className="text-2xl font-black text-white">
                              -{(simResult.baseline_churn_probability - simResult.new_churn_probability).toFixed(3).replace("0.", ".")}<span className="text-sm font-bold opacity-40">pts</span>
                            </p>
                          </div>
                        </div>
                        <div className="bg-slate-950/80 p-6 rounded-3xl text-xs text-slate-300 border border-white/5 relative">
                          <p className="font-black text-cyan-500 uppercase tracking-widest mb-2 text-[9px] flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-cyan-500" /> Prescribed Action Plan
                          </p>
                          <p className="font-medium leading-relaxed italic">"{simResult.action_plan_after}"</p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// Subcomponents

function KPICard({ label, value, subtext, color, icon }: { 
  label: string; 
  value: string; 
  subtext: string; 
  color: "rose" | "cyan" | "blue"; 
  icon: React.ReactNode; 
}) {
  const colors: Record<"rose" | "cyan" | "blue", string> = {
    rose: "border-rose-500/30 text-rose-500",
    cyan: "border-cyan-500/30 text-cyan-500",
    blue: "border-blue-500/30 text-blue-500",
  };

  return (
    <div className={`bg-slate-900/30 border border-white/5 p-8 rounded-3xl relative overflow-hidden backdrop-blur-xl transition-all duration-500 hover:scale-[1.02] hover:bg-slate-900/50 group`}>
      <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${color === 'rose' ? 'from-rose-500' : color === 'cyan' ? 'from-cyan-500' : 'from-blue-500'} to-transparent`} />
      <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-700 pointer-events-none">
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-[3px] font-black text-slate-500 mb-3">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-4xl font-black text-white tracking-tighter">{value}</h3>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${colors[color]} bg-white/5 border`}>
          Live Metric
        </span>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{subtext}</p>
      </div>
    </div>
  );
}

function CustomerListItem({ customer, onSelect }: { customer: CustomerRecord; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="p-5 bg-slate-950/40 border border-white/5 rounded-3xl cursor-pointer transition-all duration-300 hover:bg-slate-900 hover:border-rose-500/30 flex items-center justify-between group relative overflow-hidden"
    >
      <div className={`absolute left-0 top-0 h-full w-1 bg-rose-500 transition-all duration-500 opacity-0 group-hover:opacity-100 shadow-[0_0_10px_#f43f5e]`} />
      <div className="min-w-0 flex-1 relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-bold text-slate-100 truncate tracking-tight">{customer.customer_unique_id}</span>
          <span className="shrink-0 text-[8px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 font-black tracking-[1px]">CRITICAL</span>
        </div>
        <div className="flex gap-6 text-[9px] text-slate-500 font-black uppercase tracking-widest">
          <div className="flex flex-col">
            <span className="text-slate-200 text-xs">{formatMoney(customer.predicted_clv)}</span>
            <span className="opacity-40">Est. Life Value</span>
          </div>
          <div className="flex flex-col">
            <span className="text-rose-400 text-xs">{formatPct(customer.churn_probability)}%</span>
            <span className="opacity-40">Risk Signal</span>
          </div>
        </div>
      </div>
      <div className="w-10 h-10 rounded-2xl border border-white/10 flex items-center justify-center opacity-20 group-hover:opacity-100 transition-all group-hover:bg-rose-500 group-hover:border-rose-400 group-hover:text-white shadow-lg group-hover:shadow-rose-500/30">
        <ArrowRight size={16} />
      </div>
    </div>
  );
}

function Drawer({ open, onClose, title, children }: any) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 transition-all duration-500 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <aside className={`fixed top-0 right-0 h-[100dvh] w-full max-w-xl bg-[#020617] z-[60] shadow-[0_0_100px_rgba(0,0,0,0.8)] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="h-full flex flex-col border-l border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 blur-[150px] -mr-64 -mt-64 rounded-full pointer-events-none" />
          <div className="flex items-center justify-between p-10 pb-8 border-b border-white/5 relative z-10">
            <div>
              <p className="text-[10px] text-cyan-500 font-black uppercase tracking-[5px] mb-2 leading-none flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping" /> Strategic Insight
              </p>
              <h2 className="text-3xl font-black tracking-tighter">{title}</h2>
            </div>
            <button onClick={onClose} className="p-4 border border-white/10 rounded-[2rem] hover:bg-white/5 hover:border-white/20 transition-all group">
              <CloseIcon size={20} className="group-hover:rotate-90 transition-transform duration-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-10 pt-8 custom-scrollbar relative z-10">
            {children}
          </div>
        </div>
      </aside>
    </>
  );
}

// Icons (Inline SVG for Zero Dependencies)
function RiskIcon({ size = 80 }: any) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function CLVIcon() { return <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function CohortIcon({ size = 80 }: any) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function ArrowRight({ size, className }: any) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>; }
function CloseIcon({ size, className }: any) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function AIIcon({ size }: any) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 1 1-10 10h10V2z"/><path d="M12 12L2.5 2.5"/><path d="M12 12l9.5-9.5"/><path d="M12 12l9.5 9.5"/><path d="M12 12l-9.5 9.5"/></svg>; }
function SimulateIcon({ size }: any) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>; }
function AssignIcon({ size }: any) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>; }
