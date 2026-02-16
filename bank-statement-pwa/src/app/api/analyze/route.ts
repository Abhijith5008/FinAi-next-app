import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export const runtime = "nodejs";

// Set worker source explicitly for pdfjs-dist v5 in Node route handlers.
const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

type FileType = "pdf" | "csv" | "image" | "unknown";

type Txn = {
    id: string;
    date: string;
    description: string;
    amount: number;
    currency: string;
    category: string;
    confidence: number;
    merchant?: string;
    isSubscription?: boolean;
};

type AnalyzeMeta = {
    fileType: FileType;
    encrypted?: boolean;
    pageCount?: number;

    // NEW
    extractedTextChars?: number;
    requiresOcr?: boolean;

    note?: string;
};

type ApiOk = { ok: true; txns: Txn[]; meta: AnalyzeMeta };
type ApiFail = { ok: false; message: string; needsPassword?: boolean };
type ApiResponse = ApiOk | ApiFail;
type ParsedRow = {
    date: string;
    valueDate?: string;
    particulars: string;
    withdrawal?: number;
    deposit?: number;
    balance?: number;
    balanceType?: "DR" | "CR";
};

function fileTypeOf(file: File): FileType {
    const name = file.name.toLowerCase();
    const mime = file.type;
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (mime === "text/csv" || name.endsWith(".csv")) return "csv";
    if (
        mime.startsWith("image/") ||
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg")
    )
        return "image";
    return "unknown";
}

function toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : "Unknown error";
}

function toPasswordFail(err: unknown): ApiFail | null {
    if (!err || typeof err !== "object") return null;

    const code = "code" in err ? Number((err as { code?: unknown }).code) : NaN;
    const name = "name" in err ? String((err as { name?: unknown }).name) : "";
    const msg = "message" in err ? String((err as { message?: unknown }).message) : "";
    const upperMsg = msg.toUpperCase();

    const NEED_PASSWORD = pdfjsLib.PasswordResponses?.NEED_PASSWORD ?? 1;
    const INCORRECT_PASSWORD = pdfjsLib.PasswordResponses?.INCORRECT_PASSWORD ?? 2;

    const looksLikePasswordError =
        name === "PasswordException" ||
        code === NEED_PASSWORD ||
        code === INCORRECT_PASSWORD ||
        upperMsg.includes("NEED_PASSWORD") ||
        upperMsg.includes("INCORRECT_PASSWORD") ||
        upperMsg.includes("PASSWORD");

    if (!looksLikePasswordError) return null;

    return {
        ok: false,
        needsPassword: true,
        message:
            code === INCORRECT_PASSWORD || upperMsg.includes("INCORRECT")
                ? "Incorrect password. Please try again."
                : "This PDF is password-protected. Enter the password to continue.",
    };
}

// Extract visible text from first N pages (cheap + good for text PDFs)
async function extractPdfText(doc: pdfjsLib.PDFDocumentProxy, maxPages: number) {
    const pages = Math.min(doc.numPages, maxPages);
    let text = "";

    for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Preserve line boundaries; flat spaces make table parsing unreliable.
        let pageText = "";
        for (const it of content.items) {
            if (!("str" in it)) continue;
            pageText += String(it.str);
            pageText += "hasEOL" in it && it.hasEOL ? "\n" : " ";
        }
        text += pageText + "\n";
    }

    return text.trim();
}

function looksLikeHeader(line: string): boolean {
    const l = line.toLowerCase().replace(/\s+/g, " ").trim();
    return (
        l.includes("date") &&
        l.includes("value date") &&
        l.includes("particular") &&
        l.includes("withdraw") &&
        l.includes("deposit") &&
        l.includes("balance")
    );
}

function parseAmountToken(token: string): number | null {
    const normalized = token.replace(/,/g, "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

function toIsoDate(d: string): string {
    const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!m) return d;
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) {
        const y = Number(yyyy);
        yyyy = String(y >= 70 ? 1900 + y : 2000 + y);
    }
    return `${yyyy}-${mm}-${dd}`;
}

function inferCategory(text: string): string {
    const t = text.toLowerCase();
    if (t.includes("upi") || t.includes("imps") || t.includes("neft") || t.includes("rtgs")) return "transfer";
    if (t.includes("atm")) return "cash";
    if (t.includes("salary")) return "income";
    if (t.includes("interest")) return "interest";
    if (t.includes("emi") || t.includes("loan")) return "loan";
    if (t.includes("charge") || t.includes("fee")) return "fees";
    return "uncategorized";
}

function parseStatementRows(text: string): ParsedRow[] {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    const rows: ParsedRow[] = [];
    let inTable = false;
    let current: ParsedRow | null = null;

    for (const line of lines) {
        if (!inTable && looksLikeHeader(line)) {
            inTable = true;
            continue;
        }
        if (!inTable) continue;

        const txStart = line.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.*)$/);
        if (txStart) {
            if (current) rows.push(current);

            const [, dateRaw, valueDateRaw, restRaw] = txStart;
            const tokens = restRaw.split(" ").filter(Boolean);

            let balanceType: "DR" | "CR" | undefined;
            if (tokens.length > 0 && /^(DR|CR)$/i.test(tokens[tokens.length - 1])) {
                balanceType = tokens.pop()!.toUpperCase() as "DR" | "CR";
            }

            let balance: number | undefined;
            if (tokens.length > 0) {
                const v = parseAmountToken(tokens[tokens.length - 1]);
                if (v !== null) {
                    balance = v;
                    tokens.pop();
                }
            }

            let deposit: number | undefined;
            if (tokens.length > 0) {
                const v = parseAmountToken(tokens[tokens.length - 1]);
                if (v !== null) {
                    deposit = v;
                    tokens.pop();
                }
            }

            let withdrawal: number | undefined;
            if (tokens.length > 0) {
                const v = parseAmountToken(tokens[tokens.length - 1]);
                if (v !== null) {
                    withdrawal = v;
                    tokens.pop();
                }
            }

            current = {
                date: toIsoDate(dateRaw),
                valueDate: toIsoDate(valueDateRaw),
                particulars: tokens.join(" ").trim(),
                withdrawal,
                deposit,
                balance,
                balanceType,
            };
            continue;
        }

        // Multi-line particulars continuation.
        if (current && !looksLikeHeader(line)) {
            current.particulars = `${current.particulars} ${line}`.trim();
        }
    }

    if (current) rows.push(current);
    return rows.filter((r) => r.particulars.length > 0);
}

function toTxns(rows: ParsedRow[]): Txn[] {
    return rows.map((r, i) => {
        const hasDeposit = typeof r.deposit === "number" && r.deposit > 0;
        const hasWithdrawal = typeof r.withdrawal === "number" && r.withdrawal > 0;

        let amount = 0;
        if (hasDeposit) amount = r.deposit!;
        else if (hasWithdrawal) amount = -r.withdrawal!;
        else if (typeof r.balance === "number") amount = r.balanceType === "CR" ? r.balance : -r.balance;

        return {
            id: `${r.date}-${i + 1}`,
            date: r.date,
            description: r.particulars,
            amount,
            currency: "INR",
            category: inferCategory(r.particulars),
            confidence: hasDeposit || hasWithdrawal ? 0.82 : 0.62,
        };
    });
}

export async function POST(req: Request) {
    try {
        const form = await req.formData();
        const file = form.get("file");

        if (!file || !(file instanceof File)) {
            return NextResponse.json<ApiFail>(
                { ok: false, message: "Missing file." },
                { status: 400 }
            );
        }

        const passwordRaw = form.get("password");
        const password =
            typeof passwordRaw === "string" && passwordRaw.trim().length > 0
                ? passwordRaw.trim()
                : undefined;

        const ft = fileTypeOf(file);

        // ---------------- PDF ----------------
        if (ft === "pdf") {
            const bytes = new Uint8Array(await file.arrayBuffer());

            const init = {
                data: bytes,
                password,
            } as Parameters<typeof pdfjsLib.getDocument>[0];

            const loadingTask = pdfjsLib.getDocument(init);

            // ✅ reliable password handling
            const passwordPrompt = new Promise<never>((_, reject) => {
                loadingTask.onPassword = (_updatePassword: (pw: string) => void, reason: number) => {
                    const INCORRECT_PASSWORD = pdfjsLib.PasswordResponses?.INCORRECT_PASSWORD ?? 2;

                    loadingTask.destroy().catch(() => undefined);

                    const payload: ApiFail = {
                        ok: false,
                        needsPassword: true,
                        message:
                            reason === INCORRECT_PASSWORD
                                ? "Incorrect password. Please try again."
                                : "This PDF is password-protected. Enter the password to continue.",
                    };

                    reject(payload);
                };
            });

            try {
                const doc = await Promise.race([loadingTask.promise, passwordPrompt]);

                const pageCount = doc.numPages;

                // Parse all pages for transaction extraction.
                const text = await extractPdfText(doc, doc.numPages);
                const extractedTextChars = text.length;
                const parsedRows = parseStatementRows(text);
                const txns = toTxns(parsedRows);

                // Heuristic: if very little text, likely scanned => needs OCR pipeline
                const looksScanned = extractedTextChars < 50;

                const meta: AnalyzeMeta = {
                    fileType: "pdf",
                    encrypted: false,
                    pageCount,
                    extractedTextChars,
                    requiresOcr: looksScanned,
                    note: looksScanned
                        ? "Scanned/ image-based PDF detected. Needs OCR (PDF pages must be converted to images first)."
                        : `Text PDF detected. Parsed ${txns.length} transactions.`,
                };

                const payload: ApiOk = { ok: true, txns, meta };
                return NextResponse.json<ApiResponse>(payload);
            } catch (err: unknown) {
                // If err is our ApiFail object
                if (err && typeof err === "object" && "ok" in err) {
                    const maybeFail = err as ApiFail;
                    if (maybeFail.ok === false) {
                        return NextResponse.json<ApiResponse>(maybeFail, { status: 401 });
                    }
                }
                const passwordFail = toPasswordFail(err);
                if (passwordFail) {
                    return NextResponse.json<ApiResponse>(passwordFail, { status: 401 });
                }

                return NextResponse.json<ApiFail>(
                    { ok: false, message: `PDF error: ${toErrorMessage(err)}` },
                    { status: 400 }
                );
            }
        }

        // ---------------- CSV ( hookup next ) ----------------
        if (ft === "csv") {
            return NextResponse.json<ApiResponse>({
                ok: true,
                txns: [],
                meta: { fileType: "csv", note: "MVP: CSV parsing next." },
            });
        }

        // ---------------- IMAGE (OCR next) ----------------
        if (ft === "image") {
            return NextResponse.json<ApiResponse>({
                ok: true,
                txns: [],
                meta: {
                    fileType: "image",
                    note: "MVP: Image OCR next (Google Vision API key works here directly).",
                },
            });
        }

        return NextResponse.json<ApiResponse>(
            { ok: false, message: "Unsupported file type. Upload PDF, CSV, JPG, or PNG." },
            { status: 415 }
        );
    } catch (err: unknown) {
        return NextResponse.json<ApiResponse>(
            { ok: false, message: toErrorMessage(err) },
            { status: 500 }
        );
    }
}
