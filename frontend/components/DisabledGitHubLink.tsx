"use client";

// Small client component only for this one interactive piece --
// TODO: wire in the real repository URL once this is pushed publicly,
// then this can just become a plain <a href> and this file can go away.
export function DisabledGitHubLink() {
  return (
    <a
      href="#"
      className="inline-block rounded border border-terminal-border px-5 py-2.5 text-xs uppercase tracking-wide hover:bg-terminal-surface opacity-50 cursor-not-allowed"
      aria-disabled="true"
      onClick={(e) => e.preventDefault()}
    >
      View on GitHub
    </a>
  );
}
