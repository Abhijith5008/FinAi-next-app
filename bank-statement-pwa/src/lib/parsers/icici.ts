import { DATE_TOKEN, inferCategory, parseAmountToken, toIsoDate } from "./common";
import type { ParserTxn, StatementParser } from "./types";

function parseIciciRows(text: string): ParserTxn[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const txns: ParserTxn[] = [];
  let prevBalance: number | null = null;
  const rowRe = new RegExp(`^(?:\\d+\\s+)?(${DATE_TOKEN})\\s+(.*)$`);

  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;

    const date = toIsoDate(m[1]);
    const rest = m[2];

    const amountMatches = Array.from(rest.matchAll(/-?\d[\d,]*\.\d{1,2}/g));
    if (amountMatches.length < 2) continue;
    const values = amountMatches
      .map((a) => parseAmountToken(a[0]))
      .filter((n): n is number => n !== null);
    if (values.length < 2) continue;

    // ICICI rows are typically: [withdrawal] [deposit] [balance] with blanks in one of first two.
    const balance = values[values.length - 1];
    const prev1 = values.length >= 2 ? values[values.length - 2] : 0;
    const prev2 = values.length >= 3 ? values[values.length - 3] : undefined;
    let withdrawal: number | undefined;
    let deposit: number | undefined;

    if (typeof prev2 === "number") {
      withdrawal = prev2 > 0 ? prev2 : undefined;
      deposit = prev1 > 0 ? prev1 : undefined;
    } else if (typeof prevBalance === "number") {
      const delta = balance - prevBalance;
      if (delta >= 0) deposit = Math.abs(delta);
      else withdrawal = Math.abs(delta);
    } else {
      const creditHint = /(salary|interest|refund|credit|cashback|received)/i.test(rest);
      if (creditHint) deposit = Math.abs(prev1);
      else withdrawal = Math.abs(prev1);
    }

    const firstTailIndex =
      amountMatches.length >= 3
        ? (amountMatches[amountMatches.length - 3].index ?? rest.length)
        : (amountMatches[amountMatches.length - 2].index ?? rest.length);
    const description = rest.slice(0, firstTailIndex).replace(/\s+/g, " ").trim();
    if (!description || /transaction date|withdrawal amount|deposit amount|balance/i.test(description)) continue;

    const amount = (deposit ?? 0) - (withdrawal ?? 0);
    const drCr: "CR" | "DR" = amount >= 0 ? "CR" : "DR";
    txns.push({
      date,
      description,
      amount,
      drCr,
      currency: "INR",
      category: inferCategory(description),
      confidence: 0.86,
      sourceParser: "icici-v1",
    });

    prevBalance = balance;
  }

  return txns;
}

export const iciciStatementParser: StatementParser = {
  id: "icici-v1",
  canParse(text) {
    const l = text.toLowerCase();
    if (l.includes("icici bank") && l.includes("transaction remarks")) return 0.95;
    if (l.includes("icici") && l.includes("withdrawal amount") && l.includes("deposit amount")) return 0.8;
    return 0.05;
  },
  parse(text) {
    return parseIciciRows(text);
  },
};
