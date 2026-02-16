import UploadStatement from "@/components/upload-statement";


export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Statement Analyzer</h1>
          <p className="text-slate-300">
            Upload a PDF/image/CSV. We only use OCR when required.
          </p>
        </header>

        <UploadStatement />

        <footer className="text-xs text-slate-400">
          Password-protected PDFs are supported (password is never stored).
        </footer>
      </div>
    </main>
  );
}
