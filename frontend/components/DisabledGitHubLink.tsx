const GITHUB_URL = "https://github.com/anjolagithub/ledgerline-cor";

export function DisabledGitHubLink() {
  return (
    <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-block rounded border border-terminal-border px-5 py-2.5 text-xs uppercase tracking-wide transition-colors hover:bg-terminal-surface">
      View on GitHub
    </a>
  );
}
