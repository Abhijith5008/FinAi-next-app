import Link from "next/link";
import UploadStatement from "@/components/upload-statement";

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Statement Analyzer</h1>
          <p className="text-slate-300">
            Upload a PDF/Image/CSV.
          </p>
        </header>

        <UploadStatement />

        <footer className="space-y-2 text-xs text-slate-400">
          <p>Password-protected PDFs are supported (password is never stored).</p>
          <div className="flex flex-wrap items-center gap-3">
            <span>{`Copyright (c) Abhijith | ${year}`}</span>
            <Link href="/privacy-policy" className="hover:text-slate-200">
              Privacy Policy
            </Link>
            <Link href="/terms-and-conditions" className="hover:text-slate-200">
              Terms & Conditions
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
