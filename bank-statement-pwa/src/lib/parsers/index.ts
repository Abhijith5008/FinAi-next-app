import { genericStatementParser } from "./generic";
import { iciciStatementParser } from "./icici";
import type { ParserRunResult, ParserTxn, StatementParser } from "./types";

const PARSERS: StatementParser[] = [iciciStatementParser, genericStatementParser];

function parserScore(txns: ParserTxn[], hint: number): number {
  if (txns.length === 0) return hint * 5;
  const avgConf = txns.reduce((s, t) => s + t.confidence, 0) / txns.length;
  return txns.length * (0.55 + avgConf * 0.45) + hint * 25;
}

export function runParserPipeline(text: string): ParserRunResult {
  let best: ParserRunResult = { parserId: "none", score: 0, txns: [] };

  for (const parser of PARSERS) {
    const hint = parser.canParse(text);
    if (hint <= 0) continue;
    const txns = parser.parse(text);
    const score = parserScore(txns, hint);
    if (score > best.score) best = { parserId: parser.id, score, txns };
  }

  return best;
}
