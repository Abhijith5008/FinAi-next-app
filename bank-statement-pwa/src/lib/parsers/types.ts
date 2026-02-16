export type ParserTxn = {
  date: string;
  description: string;
  amount: number;
  drCr: "CR" | "DR";
  currency: string;
  category: string;
  confidence: number;
  sourceParser: string;
};

export type ParserRunResult = {
  parserId: string;
  score: number;
  txns: ParserTxn[];
};

export type StatementParser = {
  id: string;
  canParse: (text: string) => number; // 0..1
  parse: (text: string) => ParserTxn[];
};
