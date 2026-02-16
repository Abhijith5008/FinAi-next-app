"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AnalyzeOk, Txn } from "@/lib/types/analyze";

const PAGE_SIZE = 40;

type Props = {
  data: AnalyzeOk & { uploadedFileName?: string; uploadedAtIso?: string };
};

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function categoryPillClass(category: string) {
  const c = category.toLowerCase();
  if (c.includes("income") || c.includes("interest")) return "bg-emerald-900/40 text-emerald-300 border-emerald-700/40";
  if (c.includes("loan") || c.includes("fees")) return "bg-amber-900/40 text-amber-300 border-amber-700/40";
  if (c.includes("transfer")) return "bg-sky-900/40 text-sky-300 border-sky-700/40";
  if (c.includes("cash")) return "bg-violet-900/40 text-violet-300 border-violet-700/40";
  return "bg-slate-800/70 text-slate-200 border-slate-700";
}

function txnToCsvRow(t: Txn) {
  const safe = (s: string) => `"${s.replaceAll('"', '""')}"`;
  return [
    safe(t.id),
    safe(t.date),
    safe(t.description),
    String(t.amount),
    safe(t.currency),
    safe(t.category),
    String(t.confidence),
  ].join(",");
}

export default function AnalysisDashboard({ data }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [direction, setDirection] = useState<"all" | "credit" | "debit">("all");
  const [month, setMonth] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(data.txns.map((t) => t.category))).sort()],
    [data.txns]
  );

  const months = useMemo(
    () => ["all", ...Array.from(new Set(data.txns.map((t) => t.date.slice(0, 7)))).sort()],
    [data.txns]
  );

  const filteredTxns = useMemo(() => {
    const min = Number(minAmount);
    return data.txns.filter((t) => {
      if (query && !t.description.toLowerCase().includes(query.toLowerCase())) return false;
      if (category !== "all" && t.category !== category) return false;
      if (direction === "credit" && t.amount <= 0) return false;
      if (direction === "debit" && t.amount >= 0) return false;
      if (month !== "all" && !t.date.startsWith(month)) return false;
      if (Number.isFinite(min) && min > 0 && Math.abs(t.amount) < min) return false;
      return true;
    });
  }, [category, data.txns, direction, minAmount, month, query]);

  const sortedTxns = useMemo(() => {
    return [...filteredTxns].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return Math.abs(b.amount) - Math.abs(a.amount);
    });
  }, [filteredTxns]);

  const totalPages = Math.max(1, Math.ceil(sortedTxns.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTxns = sortedTxns.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const maxCategoryTotal = Math.max(1, ...data.insights.categoryBreakdown.map((c) => c.total));

  function exportCsv() {
    const header = "id,date,description,amount,currency,category,confidence";
    const body = sortedTxns.map(txnToCsvRow).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "statement-analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">Detailed Statement Analysis</h1>
            <p className="text-sm text-slate-300">
              {data.uploadedFileName ? `File: ${data.uploadedFileName}` : "Uploaded statement"}
              {data.uploadedAtIso ? ` • ${new Date(data.uploadedAtIso).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={exportCsv}
            >
              Export CSV
            </button>
            <Link className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" href="/">
              Upload Another
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Transactions</div>
            <div className="text-lg text-slate-100">{data.insights.transactionCount}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Paid</div>
            <div className="text-lg text-rose-300">{formatINR(data.insights.totalDebits)}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Received</div>
            <div className="text-lg text-emerald-300">{formatINR(data.insights.totalCredits)}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Net</div>
            <div className={`text-lg ${data.insights.netFlow >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {formatINR(data.insights.netFlow)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Income/Expense</div>
            <div className="text-lg text-slate-100">
              {data.insights.incomeExpenseRatio === null ? "N/A" : data.insights.incomeExpenseRatio.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Avg Debit</div>
            <div className="text-lg text-slate-100">{formatINR(data.insights.avgDebit)}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Avg Credit</div>
            <div className="text-lg text-slate-100">{formatINR(data.insights.avgCredit)}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-slate-400">Pages</div>
            <div className="text-lg text-slate-100">{data.meta.pageCount ?? "N/A"}</div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h2 className="text-sm text-slate-300">Category Breakdown</h2>
            {data.insights.categoryBreakdown.slice(0, 10).map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`rounded border px-2 py-0.5 capitalize ${categoryPillClass(c.category)}`}>{c.category}</span>
                  <span className="text-slate-300">{c.count} txns</span>
                  <span className="text-slate-100">{formatINR(c.total)}</span>
                </div>
                <div className="h-2 rounded bg-slate-800">
                  <div
                    className="h-2 rounded bg-sky-500"
                    style={{ width: `${Math.min(100, (c.total / maxCategoryTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h2 className="text-sm text-slate-300">Month-over-Month</h2>
            <div className="grid grid-cols-4 text-[11px] uppercase tracking-wide text-slate-400 border border-slate-800 rounded px-2 py-2 bg-slate-900/60">
              <div>Month</div>
              <div className="text-right">Income</div>
              <div className="text-right">Expense</div>
              <div className="text-right">Net</div>
            </div>
            {data.insights.monthOverMonth.map((m) => (
              <div key={m.month} className="grid grid-cols-4 text-xs border border-slate-800 rounded px-2 py-2">
                <div className="text-slate-200">{m.month}</div>
                <div className="text-emerald-300 text-right">{formatINR(m.income)}</div>
                <div className="text-rose-300 text-right">{formatINR(m.expense)}</div>
                <div className={`text-right ${m.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatINR(m.net)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h2 className="text-sm text-slate-300">Subscription Detection</h2>
            {data.insights.subscriptions.length === 0 && (
              <p className="text-xs text-slate-400">No recurring patterns detected yet.</p>
            )}
            {data.insights.subscriptions.map((s) => (
              <div key={s.merchant} className="flex items-center justify-between border border-slate-800 rounded p-2 text-xs">
                <div className="text-slate-200">{s.merchant}</div>
                <div className="text-slate-400">{s.count}x</div>
                <div className="text-slate-100">{formatINR(s.avgAmount)} avg</div>
                <div className="text-rose-300">{formatINR(s.totalAmount)}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h2 className="text-sm text-slate-300">Unusual Spend Alerts</h2>
            {data.insights.unusualSpends.length === 0 && (
              <p className="text-xs text-slate-400">No unusual spends detected.</p>
            )}
            {data.insights.unusualSpends.map((u) => (
              <div key={u.id} className="grid grid-cols-4 gap-2 border border-rose-800/40 bg-rose-950/20 rounded p-2 text-xs">
                <div className="text-slate-300">{u.date}</div>
                <div className="text-slate-200 col-span-2 truncate">{u.description}</div>
                <div className="text-rose-300 text-right">{formatINR(u.amount)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <h2 className="text-sm text-slate-300">Transaction Explorer</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
              placeholder="Search description"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as "all" | "credit" | "debit");
                setPage(1);
              }}
            >
              <option value="all">all</option>
              <option value="credit">credit</option>
              <option value="debit">debit</option>
            </select>
            <input
              className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm"
              placeholder="Min abs amount"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="text-xs text-slate-400">Showing {pageTxns.length} of {sortedTxns.length} filtered transactions</div>

          <div className="max-h-[34rem] overflow-auto border border-slate-800 rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 sticky top-0">
                <tr className="text-slate-400">
                  <th className="text-left px-2 py-2">Date</th>
                  <th className="text-left px-2 py-2">Description</th>
                  <th className="text-left px-2 py-2">Category</th>
                  <th className="text-left px-2 py-2">CR/DR</th>
                  <th className="text-right px-2 py-2">Amount</th>
                  <th className="text-right px-2 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {pageTxns.map((t) => (
                  <tr key={t.id} className="border-t border-slate-800">
                    <td className="px-2 py-2 text-slate-300">{t.date}</td>
                    <td className="px-2 py-2 text-slate-200">{t.description}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded border px-2 py-0.5 capitalize ${categoryPillClass(t.category)}`}>
                        {t.category}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {(() => {
                        const marker = t.drCr ?? (t.amount >= 0 ? "CR" : "DR");
                        const isCredit = marker === "CR";
                        return (
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                          isCredit
                            ? "border-emerald-700/50 bg-emerald-900/30 text-emerald-300"
                            : "border-rose-700/50 bg-rose-900/30 text-rose-300"
                        }`}
                      >
                        {marker}
                      </span>
                        );
                      })()}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium ${(t.drCr ?? (t.amount >= 0 ? "CR" : "DR")) === "CR" ? "text-emerald-300" : "text-rose-300"}`}>
                      {(t.drCr ?? (t.amount >= 0 ? "CR" : "DR")) === "CR" ? "+" : "-"}
                      {formatINR(Math.abs(t.amount))}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-400">{(t.confidence * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs">
            <button
              className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-slate-400">Page {currentPage} / {totalPages}</span>
            <button
              className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
          <h2 className="text-sm text-slate-300">Meta</h2>
          <pre className="text-xs overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-slate-200">
            {JSON.stringify(data.meta, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
