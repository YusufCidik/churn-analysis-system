"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Impact = {
  feature: string;
  impact: number;
  direction: "positive" | "negative";
};

type CustomerResult = {
  customer_id: string;
  churn_probability: number;
  will_churn: boolean;
  risk_label: "Düşük Risk" | "Orta Risk" | "KRİTİK";
  threshold: number;
  top_impacts: Impact[];
  commentary: string;
  monthly_charges: number;
  tenure: number;
};

type AnalyzeResponse = {
  threshold: number;
  count: number;
  results: CustomerResult[];
};

type CouponResponse = {
  customer_id: string;
  coupon_code: string;
  discount_percent: number;
  message: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080";

function riskBadgeClass(level: CustomerResult["risk_label"]): string {
  if (level === "KRİTİK") return "bg-rose-500/20 text-rose-300 border-rose-400/30";
  if (level === "Orta Risk") return "bg-amber-500/20 text-amber-300 border-amber-400/30";
  return "bg-emerald-500/20 text-emerald-300 border-emerald-400/30";
}

export default function Home() {
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponMap, setCouponMap] = useState<Record<string, CouponResponse>>({});
  const [alert, setAlert] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const krit = results.filter((r) => r.risk_label === "KRİTİK").length;
    const orta = results.filter((r) => r.risk_label === "Orta Risk").length;
    const dusuk = results.filter((r) => r.risk_label === "Düşük Risk").length;
    return { krit, orta, dusuk, total: results.length };
  }, [results]);

  const trendStats = useMemo(() => {
    if (results.length === 0) {
      return {
        churnRatePct: 0,
        topSegment: "-",
        riskyAverageMonthly: 0,
      };
    }
    const risky = results.filter((r) => r.risk_label === "KRİTİK");
    const churnRatePct = (risky.length / results.length) * 100;
    const segmentCounts = [
      { name: "KRİTİK", count: totals.krit },
      { name: "Orta Risk", count: totals.orta },
      { name: "Düşük Risk", count: totals.dusuk },
    ].sort((a, b) => b.count - a.count);
    const riskyAverageMonthly =
      risky.length > 0
        ? risky.reduce((acc, item) => acc + item.monthly_charges, 0) / risky.length
        : 0;
    return {
      churnRatePct,
      topSegment: segmentCounts[0].name,
      riskyAverageMonthly,
    };
  }, [results, totals]);

  const distributionData = useMemo(() => {
    const bins = [
      { bin: "0-10", count: 0 },
      { bin: "10-20", count: 0 },
      { bin: "20-30", count: 0 },
      { bin: "30-40", count: 0 },
      { bin: "40-47.9", count: 0 },
      { bin: "47.9-60", count: 0 },
      { bin: "60-80", count: 0 },
      { bin: "80-100", count: 0 },
    ];
    results.forEach((item) => {
      const pct = item.churn_probability * 100;
      if (pct < 10) bins[0].count += 1;
      else if (pct < 20) bins[1].count += 1;
      else if (pct < 30) bins[2].count += 1;
      else if (pct < 40) bins[3].count += 1;
      else if (pct < 47.9) bins[4].count += 1;
      else if (pct < 60) bins[5].count += 1;
      else if (pct < 80) bins[6].count += 1;
      else bins[7].count += 1;
    });
    return bins;
  }, [results]);

  const onFileUpload = async (file: File) => {
    setLoading(true);
    setError("");
    setAlert("");
    setCouponMap({});
    setExpandedCustomerId(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/api/analyze-file`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Analiz servisi hata dondurdu.");
      }
      const data = (await response.json()) as AnalyzeResponse;
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen bir hata olustu.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const generateCoupon = async (row: CustomerResult) => {
    setAlert("");
    try {
      const response = await fetch(`${API_BASE}/api/coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: row.customer_id,
          churn_probability: row.churn_probability,
          risk_label: row.risk_label,
          monthly_charges: row.monthly_charges,
          tenure: row.tenure,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Kupon olusturulamadi.");
      }
      const coupon = (await response.json()) as CouponResponse;
      setCouponMap((prev) => ({ ...prev, [row.customer_id]: coupon }));
      setAlert(`${row.customer_id} icin teklif hazir: ${coupon.message}`);
    } catch (err) {
      setAlert(err instanceof Error ? err.message : "Kupon olusturma hatasi.");
    }
  };

  return (
    <main className="min-h-screen bg-[#080B14] text-slate-100">
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-cyan-300">AI Analytics</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Telco Churn Intelligence
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Minimal gorunum + acilir detay paneli. Threshold:{" "}
                <span className="font-semibold text-cyan-300">0.4790</span>
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20">
              Dosya Yukle (csv/json/xlsx)
              <input
                type="file"
                accept=".csv,.json,.xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFileUpload(file);
                }}
              />
            </label>
          </div>
          {loading && <p className="mt-3 text-sm text-slate-300">Analiz calisiyor...</p>}
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          {alert && (
            <div className="mt-3 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              {alert}
            </div>
          )}
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-cyan-500/20 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-cyan-300">Genel Kayip Orani (%)</p>
            <p className="mt-2 text-2xl font-semibold">{trendStats.churnRatePct.toFixed(2)}%</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-violet-300">En Cok Kayip Segment</p>
            <p className="mt-2 text-2xl font-semibold">{trendStats.topSegment}</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-amber-300">
              Ortalama Monthly Charges (Riskli Grupta)
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {trendStats.riskyAverageMonthly.toFixed(2)}
            </p>
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Toplam</p>
            <p className="mt-2 text-2xl font-semibold">{totals.total}</p>
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-rose-300">Kritik</p>
            <p className="mt-2 text-2xl font-semibold">{totals.krit}</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-amber-300">Orta</p>
            <p className="mt-2 text-2xl font-semibold">{totals.orta}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-slate-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-emerald-300">Dusuk</p>
            <p className="mt-2 text-2xl font-semibold">{totals.dusuk}</p>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">Churn Probability Distribution</h3>
            <span className="text-xs text-slate-400">Histogram</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis dataKey="bin" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }}
                />
                <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((row) => (
            <article
              key={row.customer_id}
              className="rounded-xl border border-slate-800 bg-slate-900/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Musteri</p>
                  <h2 className="text-base font-semibold">{row.customer_id}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Tenure: {row.tenure} ay · ARPU: {row.monthly_charges}
                  </p>
                </div>
                <span className={`rounded-md border px-2 py-1 text-xs ${riskBadgeClass(row.risk_label)}`}>
                  {row.risk_label}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">
                Churn: <span className="font-semibold text-cyan-300">{(row.churn_probability * 100).toFixed(2)}%</span>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCustomerId((prev) => (prev === row.customer_id ? null : row.customer_id))
                  }
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  {expandedCustomerId === row.customer_id ? "Detayi Gizle" : "Detayi Ac"}
                </button>
                <button
                  type="button"
                  onClick={() => void generateCoupon(row)}
                  disabled={row.risk_label === "Düşük Risk"}
                  className="rounded-md border border-violet-400/30 bg-violet-500/20 px-3 py-1.5 text-xs text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Kupon Uret
                </button>
              </div>
              {couponMap[row.customer_id] && (
                <p className="mt-2 text-xs text-emerald-300">
                  {couponMap[row.customer_id].coupon_code} · %{couponMap[row.customer_id].discount_percent}
                </p>
              )}
              {expandedCustomerId === row.customer_id && (
                <div className="mt-4 space-y-3 rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
                  <p className="text-xs leading-relaxed text-slate-300">{row.commentary}</p>
                  <div className="space-y-2">
                    {row.top_impacts.map((impact) => {
                      const width = Math.min(Math.max(Math.abs(impact.impact) * 100, 4), 100);
                      const color =
                        impact.direction === "positive"
                          ? "bg-rose-400/80"
                          : "bg-emerald-400/80";
                      return (
                        <div key={impact.feature}>
                          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-300">
                            <span className="truncate pr-2">{impact.feature}</span>
                            <span>{impact.impact.toFixed(3)}</span>
                          </div>
                          <div className="h-1.5 rounded bg-slate-800">
                            <div className={`h-1.5 rounded ${color}`} style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
