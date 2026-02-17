"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AnalysisDashboard from "@/components/analysis-dashboard";
import type { AnalyzeOk } from "@/lib/types/analyze";

const ANALYSIS_STORAGE_KEY = "statement_analysis_result_v1";

type StoredAnalysis = AnalyzeOk & { uploadedFileName?: string; uploadedAtIso?: string };

export default function AnalysisPage() {
  const [data, setData] = useState<StoredAnalysis | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem(ANALYSIS_STORAGE_KEY) ??
        localStorage.getItem(ANALYSIS_STORAGE_KEY);
      if (!raw) {
        setData(null);
        return;
      }
      const parsed = JSON.parse(raw) as StoredAnalysis;
      setData(parsed && parsed.ok ? parsed : null);
    } catch {
      setData(null);
    } finally {
      setReady(true);
    }
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-3">
          <h1 className="text-xl font-semibold">Loading analysis...</h1>
          <p className="text-sm text-slate-300">Preparing local analysis data.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-3">
          <h1 className="text-xl font-semibold">No analysis data found</h1>
          <p className="text-sm text-slate-300">
            Upload a statement first. This screen loads data from browser session storage.
          </p>
          <Link href="/" className="inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
            Go to Upload
          </Link>
        </div>
      </main>
    );
  }

  return <AnalysisDashboard data={data} />;
}
