import Link from "next/link";

export default function TermsAndConditionsPage() {
  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Legal
          </p>
          <h1 className="text-3xl font-semibold">Terms and Conditions</h1>
          <p className="text-sm text-slate-300">
            Rules and responsibilities when using statement analysis features.
          </p>
        </header>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">
              Informational use
            </h2>
            <p className="text-sm leading-6 text-slate-300">
              This tool provides informational output only. You remain
              responsible for reviewing all results before making financial
              decisions.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">
              Upload authority
            </h2>
            <p className="text-sm leading-6 text-slate-300">
              You must have legal permission to upload and process any statement
              or document you submit through this service.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">
              Service updates
            </h2>
            <p className="text-sm leading-6 text-slate-300">
              Features and terms may change over time. Continued usage indicates
              acceptance of the latest published terms.
            </p>
          </div>
        </section>

        <footer className="space-y-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span>{`Copyright (c) Abhijith | ${year}`}</span>
            <Link href="/" className="hover:text-slate-200">
              Back to Home
            </Link>
            <Link href="/privacy-policy" className="hover:text-slate-200">
              Privacy Policy
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
