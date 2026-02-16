export type FileType = "pdf" | "csv" | "image" | "unknown";

export type Txn = {
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

export type AnalyzeMeta = {
  fileType: FileType;
  encrypted?: boolean;
  pageCount?: number;
  extractedTextChars?: number;
  requiresOcr?: boolean;
  note?: string;
};

export type Insights = {
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

export type AnalyzeOk = {
  ok: true;
  txns: Txn[];
  meta: AnalyzeMeta;
  insights: Insights;
};

export type AnalyzeFail = {
  ok: false;
  message: string;
  needsPassword?: boolean;
};

export type AnalyzeResponse = AnalyzeOk | AnalyzeFail;
