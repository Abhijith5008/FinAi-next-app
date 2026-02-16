import { DATE_TOKEN, inferCategory, parseAmountToken, toIsoDate } from "./common";
import type { ParserTxn, StatementParser } from "./types";

type ParsedRow = {
  date: string;
  particulars: string;
  withdrawal?: number;
  deposit?: number;
  txnAmount?: number;
  balance?: number;
};

function looksLikeHeader(line: string): boolean {
  const l = line.toLowerCase().replace(/\s+/g, " ").trim();
  const hasDateCols = (l.includes("date") && l.includes("value date")) || l.includes("transaction date");
  const hasDescCol = l.includes("particular") || l.includes("remarks") || l.includes("transaction remarks");
  return hasDateCols && hasDescCol && l.includes("withdraw") && l.includes("deposit") && l.includes("balance");
}

function parseRows(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];
  let inTable = false;
  let current: ParsedRow | null = null;
  const rowRe = new RegExp(`^(?:\\d+\\s+)?(${DATE_TOKEN})(?:\\s+(${DATE_TOKEN}))?\\s+(.*)$`);

  for (const line of lines) {
    if (!inTable && looksLikeHeader(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;

    const m = line.match(rowRe);
    if (m) {
      if (current) rows.push(current);
      const date = toIsoDate(m[1]);
      const restRaw = m[3];
      const amountMatches = Array.from(restRaw.matchAll(/-?\d[\d,]*\.\d{1,2}/g));
      const amountValues = amountMatches
        .map((a) => parseAmountToken(a[0]))
        .filter((n): n is number => n !== null);
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

      current = {
        date,
        particulars,
        withdrawal: lastThree.length === 3 ? lastThree[0] : undefined,
        deposit: lastThree.length === 3 ? lastThree[1] : undefined,
        txnAmount: lastThree.length === 2 ? lastThree[0] : undefined,
        balance: lastThree.length > 0 ? lastThree[lastThree.length - 1] : undefined,
      };
      continue;
    }

    if (current) current.particulars = `${current.particulars} ${line}`.trim();
  }
  if (current) rows.push(current);
  return rows.filter((r) => r.particulars.length > 0);
}

function rowsToTxns(rows: ParsedRow[]): ParserTxn[] {
  const txns: ParserTxn[] = [];
  let prevBalance: number | null = null;
  for (const r of rows) {
    if (r.particulars.toLowerCase().includes("opening balance")) {
      if (typeof r.balance === "number") prevBalance = r.balance;
      continue;
    }

    const hasDeposit = typeof r.deposit === "number" && r.deposit > 0;
    const hasWithdrawal = typeof r.withdrawal === "number" && r.withdrawal > 0;
    let amount = 0;
    if (hasDeposit && hasWithdrawal) amount = r.deposit! - r.withdrawal!;
    else if (hasDeposit) amount = r.deposit!;
    else if (hasWithdrawal) amount = -r.withdrawal!;
    else if (typeof r.balance === "number" && typeof prevBalance === "number") amount = r.balance - prevBalance;
    else if (typeof r.txnAmount === "number") {
      const creditHint = /(salary|interest|refund|credit|cr\b|deposit|cashback|received)/i.test(r.particulars);
      amount = creditHint ? Math.abs(r.txnAmount) : -Math.abs(r.txnAmount);
    } else {
      continue;
    }

    if (typeof r.balance === "number") prevBalance = r.balance;
    const drCr = amount >= 0 ? "CR" : "DR";
    txns.push({
      date: r.date,
      description: r.particulars,
      amount,
      drCr,
      currency: "INR",
      category: inferCategory(r.particulars),
      confidence: hasDeposit || hasWithdrawal ? 0.84 : 0.68,
      sourceParser: "generic-v1",
    });
  }
  return txns;
}

export const genericStatementParser: StatementParser = {
  id: "generic-v1",
  canParse(text) {
    const lower = text.toLowerCase();
    if (lower.includes("value date") && lower.includes("withdraw") && lower.includes("deposit")) return 0.75;
    if (lower.includes("transaction date") && lower.includes("withdraw")) return 0.55;
    return 0.2;
  },
  parse(text) {
    const rows = parseRows(text);
    return rowsToTxns(rows);
  },
};
