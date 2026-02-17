import Link from "next/link";

export default function PrivacyPolicyPage() {
  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Legal
          </p>
          <h1 className="text-3xl font-semibold">Privacy Policy</h1>
          <p className="text-sm text-slate-300">
            How statement files and extracted data are handled in this service.
          </p>
        </header>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">Data usage</h2>
            <p className="text-sm leading-6 text-slate-300">
              Uploaded files are processed only to generate analysis results and
              improve the in-app experience.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">Data handling</h2>
            <p className="text-sm leading-6 text-slate-300">
              Statement content and extracted values are handled securely for
              processing, and are not sold to third parties.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">PDF passwords</h2>
            <p className="text-sm leading-6 text-slate-300">
              Passwords are used only to unlock protected files during analysis
              and are never stored after processing.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">Consent</h2>
            <p className="text-sm leading-6 text-slate-300">
              By using this service, you consent to the processing required to
              analyze submitted statements.
            </p>
          </div>
        </section>

        <footer className="space-y-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span>{`Copyright (c) Abhijith | ${year}`}</span>
            <Link href="/" className="hover:text-slate-200">
              Back to Home
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
