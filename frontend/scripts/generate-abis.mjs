// Foundry contracts/out/ is the source of truth, but the frontend does
// NOT read it at runtime or at build time -- per Phase 8 sign-off, this
// script is run manually during development to produce a deterministic,
// committed ABI snapshot in frontend/abi/. Re-run this whenever a
// contract's interface changes, then commit the result.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "contracts", "out");
const ABI_DIR = join(__dirname, "..", "abi");

const CONTRACTS = [
  "LedgerLineRegistry",
  "LedgerLinePolicy",
  "LedgerLineLendingAdapter",
  "LedgerLineVaultAdapter",
  "LedgerLineTransferAdapter",
  "RobinhoodStockTokenAdapter",
  "MockStockToken",
  "MockBorrowToken",
];

if (!existsSync(ABI_DIR)) mkdirSync(ABI_DIR, { recursive: true });

for (const name of CONTRACTS) {
  const artifactPath = join(OUT_DIR, `${name}.sol`, `${name}.json`);
  if (!existsSync(artifactPath)) {
    console.error(`!!! Missing artifact: ${artifactPath} -- run 'forge build' in contracts/ first.`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  writeFileSync(join(ABI_DIR, `${name}.json`), JSON.stringify(artifact.abi, null, 2));
  console.log(`Wrote abi/${name}.json`);
}
