"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/modal";
import type { AnalyzeResponse } from "@/lib/types/analyze";

const ANALYSIS_STORAGE_KEY = "statement_analysis_result_v1";

export default function UploadStatement() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (f: File | null) => {
    setFile(f);
    setPassword("");
    setError("");
    setPasswordModalOpen(false);
  };

  const fileLabel = useMemo(() => {
    if (!file) return "No file selected";
    return `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
  }, [file]);

  const resetAll = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPassword("");
    setBusy(false);
    setError("");
    setPasswordModalOpen(false);
  };

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetAll();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function runAnalyze(opts?: { password?: string }) {
    if (!file) return;

    setBusy(true);
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (opts?.password?.trim()) fd.append("password", opts.password.trim());

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data: AnalyzeResponse = await res.json();

      if (!data.ok) {
        setError(data.message);
        if (data.needsPassword) setPasswordModalOpen(true);
        return;
      }

      setPasswordModalOpen(false);
      setPassword("");

      const payload = JSON.stringify({
        ...data,
        uploadedFileName: file.name,
        uploadedAtIso: new Date().toISOString(),
      });

      try {
        sessionStorage.setItem(ANALYSIS_STORAGE_KEY, payload);
      } catch {
        // Fall back below.
      }
      try {
        localStorage.setItem(ANALYSIS_STORAGE_KEY, payload);
      } catch {
        // Continue; navigation fallback still runs.
      }

      router.push("/analysis");
      router.refresh();
      setTimeout(() => {
        if (window.location.pathname !== "/analysis") {
          window.location.assign("/analysis");
        }
      }, 120);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div className="space-y-2">
        <label className="block text-sm text-slate-300">Upload statement</label>
        <label
          htmlFor="statement-file-input"
          className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-4 text-sm transition ${dragActive
              ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
              : "border-slate-600 bg-slate-950/60 text-slate-300 hover:border-slate-400"
            }`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = e.dataTransfer.files?.[0] ?? null;
            handleFileSelect(dropped);
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-5 w-5 shrink-0"
            aria-hidden="true"
            width={30}
            height={30}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.2a4 4 0 1 1 5.66 5.66l-9.2 9.2a2 2 0 0 1-2.83-2.83l8.49-8.48"
            />
          </svg>
          <span>
            Drag and drop a file here, or click to browse
            <span className="block text-xs text-slate-400">
              PDF, PNG, JPG, JPEG, CSV
            </span>
          </span>
        </label>
        <input
          id="statement-file-input"
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            handleFileSelect(f);
          }}
        />
        <p className="text-xs text-slate-400">{fileLabel}</p>
      </div>

      <div className="flex gap-3">
        <button
          className="rounded-lg bg-white text-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={!file || busy}
          onClick={() => runAnalyze()}
        >
          {busy ? "Processing..." : "Analyze"}
        </button>

        <button
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={resetAll}
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Modal
        open={passwordModalOpen}
        title="Password required"
        onClose={() => {
          setPasswordModalOpen(false);
          setPassword("");
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-200">
            This PDF is password-protected. Enter the password to continue.
            We never store or log it.
          </p>

          <input
            type="password"
            value={password}
            placeholder="Enter PDF password"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
          />

          <div className="flex gap-3">
            <button
              className="rounded-lg bg-amber-200 text-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={!password.trim() || busy}
              onClick={() => runAnalyze({ password })}
            >
              {busy ? "Trying..." : "Try Password"}
            </button>

            <button
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setPasswordModalOpen(false);
                setPassword("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
