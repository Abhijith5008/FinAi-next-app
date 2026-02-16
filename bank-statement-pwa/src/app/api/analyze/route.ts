import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { googleVisionOcrFromImageBase64 } from "@/lib/ocr/google-vision-rest";
import { runParserPipeline } from "@/lib/parsers";

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
    drCr?: "CR" | "DR";
    sourceParser?: string;
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

type Insights = {
    transactionCount: number;
    totalDebits: number;
    totalCredits: number;
    netFlow: number;
    incomeExpenseRatio: number | null;
    avgDebit: number;
    avgCredit: number;
    categoryBreakdown: Array<{ category: string; count: number; total: number }>;
    monthOverMonth: Array<{ month: string; income: number; expense: number; net: number }>;
    subscriptions: Array<{ merchant: string; count: number; avgAmount: number; totalAmount: number }>;
    unusualSpends: Array<{ id: string; date: string; description: string; amount: number }>;
    topExpense?: { description: string; amount: number };
    topCredit?: { description: string; amount: number };
};

type ApiOk = { ok: true; txns: Txn[]; meta: AnalyzeMeta; insights: Insights };
type ApiFail = { ok: false; message: string; needsPassword?: boolean };
type ApiResponse = ApiOk | ApiFail;
type ParsedRow = {
    date: string;
    valueDate?: string;
    particulars: string;
    withdrawal?: number;
    deposit?: number;
    txnAmount?: number;
    balance?: number;
    balanceType?: "DR" | "CR";
};

type PositionedToken = {
    str: string;
    x: number;
    y: number;
};

const DATE_TOKEN =
    "(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{2,4}|\\d{1,2}-[A-Za-z]{3}-\\d{2,4})";

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

function normalizeAmountToken(raw: string): string {
    return raw.replace(/[^\d,.-]/g, "").replace(/,/g, "").trim();
}

function textFromPageContent(content: Awaited<ReturnType<pdfjsLib.PDFPageProxy["getTextContent"]>>): string {
    const tokens: PositionedToken[] = [];

    for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const str = String(item.str).trim();
        if (!str) continue;
        const transform = item.transform as number[];
        const x = Number(transform?.[4] ?? 0);
        const y = Number(transform?.[5] ?? 0);
        tokens.push({ str, x, y });
    }

    tokens.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 1.5) return b.y - a.y;
        return a.x - b.x;
    });

    const rows: PositionedToken[][] = [];
    for (const t of tokens) {
        const last = rows[rows.length - 1];
        if (!last || Math.abs(last[0].y - t.y) > 2.5) {
            rows.push([t]);
        } else {
            last.push(t);
        }
    }

    return rows
        .map((row) => row.sort((a, b) => a.x - b.x).map((t) => t.str).join(" "))
        .join("\n");
}

// Extract visible text using x/y grouping, which is more reliable for table PDFs.
async function extractPdfText(doc: pdfjsLib.PDFDocumentProxy, maxPages: number) {
    const pages = Math.min(doc.numPages, maxPages);
    let text = "";

    for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = textFromPageContent(content);
        text += pageText + "\n";
    }

    return text.trim();
}

async function ocrPdfPages(doc: pdfjsLib.PDFDocumentProxy, maxPages: number): Promise<string> {
    if (!process.env.GOOGLE_VISION_API_KEY) return "";

    const pages = Math.min(doc.numPages, maxPages);
    let text = "";

    // Lazy-load native canvas only when OCR is required.
    let canvasMod: {
        createCanvas: (width: number, height: number) => {
            getContext: (type: "2d") => unknown;
            toBuffer: (mimeType?: string) => Buffer;
        };
    };
    try {
        canvasMod = (await import("@napi-rs/canvas")) as unknown as {
            createCanvas: (width: number, height: number) => {
                getContext: (type: "2d") => unknown;
                toBuffer: (mimeType?: string) => Buffer;
            };
        };
    } catch {
        // Native binding missing in this environment. Skip OCR fallback.
        return "";
    }

    for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = canvasMod.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const canvasContext = canvas.getContext("2d");

        try {
            await page.render({
                canvasContext: canvasContext as CanvasRenderingContext2D,
                canvas: canvas as unknown as HTMLCanvasElement,
                viewport,
            }).promise;
        } catch {
            // If rendering fails for a page, continue with next page.
            continue;
        }

        const png = canvas.toBuffer("image/png");
        const { text: pageText } = await googleVisionOcrFromImageBase64({
            base64: png.toString("base64"),
        });
        text += `${pageText}\n`;
    }

    return text.trim();
}

function looksLikeHeader(line: string): boolean {
    const l = line.toLowerCase().replace(/\s+/g, " ").trim();
    const hasDateCols =
        (l.includes("date") && l.includes("value date")) ||
        l.includes("transaction date");
    const hasDescCol = l.includes("particular") || l.includes("remarks") || l.includes("transaction remarks");
    return hasDateCols && hasDescCol && l.includes("withdraw") && l.includes("deposit") && l.includes("balance");
}

function parseAmountToken(token: string): number | null {
    const normalized = normalizeAmountToken(token);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

function toIsoDate(d: string): string {
    const slash = d.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (slash) {
        const dd = slash[1].padStart(2, "0");
        const mm = slash[2].padStart(2, "0");
        let yyyy = slash[3];
        if (yyyy.length === 2) {
            const y = Number(yyyy);
            yyyy = String(y >= 70 ? 1900 + y : 2000 + y);
        }
        return `${yyyy}-${mm}-${dd}`;
    }

    const monthName = d.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{2,4})$/);
    if (monthName) {
        const dd = monthName[1].padStart(2, "0");
        const mmm = monthName[2].toLowerCase();
        const monthMap: Record<string, string> = {
            jan: "01",
            feb: "02",
            mar: "03",
            apr: "04",
            may: "05",
            jun: "06",
            jul: "07",
            aug: "08",
            sep: "09",
            oct: "10",
            nov: "11",
            dec: "12",
        };
        const mm = monthMap[mmm];
        if (!mm) return d;
        let yyyy = monthName[3];
        if (yyyy.length === 2) {
            const y = Number(yyyy);
            yyyy = String(y >= 70 ? 1900 + y : 2000 + y);
        }
        return `${yyyy}-${mm}-${dd}`;
    }

    return d;
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

        const txStart = line.match(new RegExp(`^(?:\\d+\\s+)?(${DATE_TOKEN})(?:\\s+(${DATE_TOKEN}))?\\s+(.*)$`));
        if (txStart) {
            if (current) rows.push(current);

            const [, dateRaw, valueDateRaw, restRaw] = txStart;
            // Money columns in statements are decimal; avoid picking up IDs/refs.
            const amountMatches = Array.from(restRaw.matchAll(/-?\d[\d,]*(?:\.\d{1,2})/g));
            const amountValues = amountMatches.map((m) => parseAmountToken(m[0])).filter((n): n is number => n !== null);
            const lastThree = amountValues.slice(-3);

            const firstTailIndex =
                amountMatches.length >= 3
                    ? (amountMatches[amountMatches.length - 3].index ?? restRaw.length)
                    : amountMatches.length >= 2
                      ? (amountMatches[amountMatches.length - 2].index ?? restRaw.length)
                      : amountMatches.length >= 1
                        ? (amountMatches[amountMatches.length - 1].index ?? restRaw.length)
                        : restRaw.length;

            const particulars = restRaw.slice(0, firstTailIndex).replace(/\s+/g, " ").trim();
            const tokens = restRaw.split(" ").filter(Boolean);

            let balanceType: "DR" | "CR" | undefined;
            if (tokens.length > 0 && /^(DR|CR)$/i.test(tokens[tokens.length - 1])) {
                balanceType = tokens.pop()!.toUpperCase() as "DR" | "CR";
            } else {
                const crdr = restRaw.match(/\b(DR|CR)\b/i);
                if (crdr) balanceType = crdr[1].toUpperCase() as "DR" | "CR";
            }

            current = {
                date: toIsoDate(dateRaw),
                valueDate: valueDateRaw ? toIsoDate(valueDateRaw) : undefined,
                particulars,
                withdrawal: lastThree.length === 3 ? lastThree[0] : undefined,
                deposit: lastThree.length === 3 ? lastThree[1] : undefined,
                txnAmount: lastThree.length === 2 ? lastThree[0] : undefined,
                balance: lastThree.length > 0 ? lastThree[lastThree.length - 1] : undefined,
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
    const txns: Txn[] = [];
    let prevBalance: number | null = null;

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const particularsLower = r.particulars.toLowerCase();
        const isOpeningBalance = particularsLower.includes("opening balance");

        const hasDeposit = typeof r.deposit === "number" && r.deposit > 0;
        const hasWithdrawal = typeof r.withdrawal === "number" && r.withdrawal > 0;

        let amount = 0;
        if (hasDeposit && hasWithdrawal) amount = r.deposit! - r.withdrawal!;
        else if (hasDeposit) amount = r.deposit!;
        else if (hasWithdrawal) amount = -r.withdrawal!;
        else if (typeof r.balance === "number" && typeof prevBalance === "number") amount = r.balance - prevBalance;
        else if (typeof r.txnAmount === "number") {
            const isCreditHint = /(salary|interest|refund|credit|cr\b|deposit|cashback|received)/i.test(r.particulars);
            amount = isCreditHint ? Math.abs(r.txnAmount) : -Math.abs(r.txnAmount);
        } else if (typeof r.balance === "number") {
            // Last fallback; may be noisy if opening balance lines leak through.
            amount = r.balanceType === "CR" ? Math.abs(r.balance) : -Math.abs(r.balance);
        }

        if (typeof r.balance === "number") {
            prevBalance = r.balanceType === "DR" ? -Math.abs(r.balance) : Math.abs(r.balance);
        }

        if (isOpeningBalance) {
            continue;
        }

        txns.push({
            id: `${r.date}-${i + 1}`,
            date: r.date,
            description: r.particulars,
            amount,
            drCr: amount >= 0 ? "CR" : "DR",
            currency: "INR",
            category: inferCategory(r.particulars),
            confidence: hasDeposit || hasWithdrawal ? 0.82 : 0.62,
        });
    }

    return txns;
}

function parseTransactionsFromText(text: string): Txn[] {
    const result = runParserPipeline(text);
    return result.txns.map((t, i) => ({
        id: `${t.date}-${result.parserId}-${i + 1}`,
        date: t.date,
        description: t.description,
        amount: t.amount,
        drCr: t.drCr,
        sourceParser: t.sourceParser,
        currency: t.currency,
        category: t.category,
        confidence: t.confidence,
    }));
}

function monthKey(dateIso: string): string | null {
    const m = dateIso.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (!m) return null;
    return `${m[1]}-${m[2]}`;
}

function normalizeMerchant(description: string): string {
    return description
        .toUpperCase()
        .replace(/\b(UPI|IMPS|NEFT|RTGS|POS|ATM|TO|BY|TRANSFER|PAYMENT|DEBIT|CREDIT|REF|TXN|ID)\b/g, " ")
        .replace(/[0-9#*._/-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildInsights(txns: Txn[]): Insights {
    const debits = txns.filter((t) => (t.drCr ? t.drCr === "DR" : t.amount < 0));
    const credits = txns.filter((t) => (t.drCr ? t.drCr === "CR" : t.amount > 0));

    const totalDebits = debits.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalCredits = credits.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const topExpenseTxn = debits.reduce<Txn | null>((best, t) => {
        if (!best) return t;
        return Math.abs(t.amount) > Math.abs(best.amount) ? t : best;
    }, null);
    const topCreditTxn = credits.reduce<Txn | null>((best, t) => {
        if (!best) return t;
        return t.amount > best.amount ? t : best;
    }, null);

    const categoryMap = new Map<string, { count: number; total: number }>();
    for (const t of txns) {
        const entry = categoryMap.get(t.category) ?? { count: 0, total: 0 };
        entry.count += 1;
        entry.total += Math.abs(t.amount);
        categoryMap.set(t.category, entry);
    }
    const categoryBreakdown = Array.from(categoryMap.entries())
        .map(([category, v]) => ({ category, count: v.count, total: v.total }))
        .sort((a, b) => b.total - a.total);

    const monthMap = new Map<string, { income: number; expense: number }>();
    for (const t of txns) {
        const mk = monthKey(t.date);
        if (!mk) continue;
        const entry = monthMap.get(mk) ?? { income: 0, expense: 0 };
        const type = t.drCr ?? (t.amount >= 0 ? "CR" : "DR");
        if (type === "CR") entry.income += Math.abs(t.amount);
        else entry.expense += Math.abs(t.amount);
        monthMap.set(mk, entry);
    }
    const monthOverMonth = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, income: v.income, expense: v.expense, net: v.income - v.expense }));

    const merchantGroups = new Map<string, Txn[]>();
    for (const t of debits) {
        const merchant = normalizeMerchant(t.description);
        if (!merchant || merchant.length < 3) continue;
        const arr = merchantGroups.get(merchant) ?? [];
        arr.push(t);
        merchantGroups.set(merchant, arr);
    }
    const subscriptions = Array.from(merchantGroups.entries())
        .map(([merchant, list]) => {
            const months = new Set(list.map((t) => monthKey(t.date)).filter(Boolean));
            const total = list.reduce((s, t) => s + Math.abs(t.amount), 0);
            const avg = total / list.length;
            return {
                merchant,
                count: list.length,
                monthCount: months.size,
                avgAmount: avg,
                totalAmount: total,
            };
        })
        .filter((g) => g.count >= 2 && g.monthCount >= 2)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10)
        .map((g) => ({
            merchant: g.merchant,
            count: g.count,
            avgAmount: g.avgAmount,
            totalAmount: g.totalAmount,
        }));

    const debitAbs = debits.map((t) => Math.abs(t.amount));
    const mean = debitAbs.length ? debitAbs.reduce((a, b) => a + b, 0) / debitAbs.length : 0;
    const variance =
        debitAbs.length > 1
            ? debitAbs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / debitAbs.length
            : 0;
    const stdDev = Math.sqrt(variance);
    const unusualThreshold = Math.max(mean * 1.8, mean + 2 * stdDev);
    const unusualSpends = debits
        .filter((t) => Math.abs(t.amount) > unusualThreshold && Math.abs(t.amount) > 1000)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 10)
        .map((t) => ({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: Math.abs(t.amount),
        }));

    const incomeExpenseRatio = totalDebits > 0 ? totalCredits / totalDebits : null;

    return {
        transactionCount: txns.length,
        totalDebits,
        totalCredits,
        netFlow: totalCredits - totalDebits,
        incomeExpenseRatio,
        avgDebit: debits.length ? totalDebits / debits.length : 0,
        avgCredit: credits.length ? totalCredits / credits.length : 0,
        categoryBreakdown,
        monthOverMonth,
        subscriptions,
        unusualSpends,
        topExpense: topExpenseTxn
            ? { description: topExpenseTxn.description, amount: Math.abs(topExpenseTxn.amount) }
            : undefined,
        topCredit: topCreditTxn ? { description: topCreditTxn.description, amount: topCreditTxn.amount } : undefined,
    };
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
                let txns = parseTransactionsFromText(text);
                const parserUsed = txns[0]?.sourceParser ?? "none";

                // Heuristic: if very little text, likely scanned => needs OCR pipeline
                const looksScanned = extractedTextChars < 50;
                let ocrChars = 0;

                // OCR fallback for scanned PDFs or when parser found no rows in text layer.
                if ((looksScanned || txns.length === 0) && process.env.GOOGLE_VISION_API_KEY) {
                    const ocrText = await ocrPdfPages(doc, Math.min(doc.numPages, 5));
                    ocrChars = ocrText.length;
                    const ocrTxns = parseTransactionsFromText(ocrText);
                    if (ocrTxns.length > txns.length) txns = ocrTxns;
                }

                const meta: AnalyzeMeta = {
                    fileType: "pdf",
                    encrypted: false,
                    pageCount,
                    extractedTextChars,
                    requiresOcr: looksScanned,
                    note: looksScanned
                        ? ocrChars > 0
                          ? `Scanned/ image-based PDF detected. OCR fallback processed ${Math.min(doc.numPages, 5)} pages.`
                          : "Scanned/ image-based PDF detected. Configure GOOGLE_VISION_API_KEY to enable OCR fallback."
                        : txns.length > 0
                          ? `Text PDF detected. Parsed ${txns.length} transactions using parser ${parserUsed}.`
                          : ocrChars > 0
                            ? "Text layer parsing failed; OCR fallback attempted."
                            : "Text PDF detected but no transaction rows were matched. Statement format rules need tuning.",
                };
                const insights = buildInsights(txns);

                const payload: ApiOk = { ok: true, txns, meta, insights };
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
                insights: buildInsights([]),
                meta: { fileType: "csv", note: "MVP: CSV parsing next." },
            });
        }

        // ---------------- IMAGE (OCR next) ----------------
        if (ft === "image") {
            return NextResponse.json<ApiResponse>({
                ok: true,
                txns: [],
                insights: buildInsights([]),
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
