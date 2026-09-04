# Sync the two CLAUDE.md files

This repo commits its own `CLAUDE.md` (`../CLAUDE.md` from here) so a fresh clone of just this repo isn't missing the file every other doc in `repo/` cites by name. The outer copy one directory above the whole working directory (`../../CLAUDE.md` from here — sibling to `repo/` and `profile-repo/`) is the one Claude Code actually auto-loads for a session started at that level. They're expected to read identically.

Whenever either copy changes:
1. Diff them: `diff ../../CLAUDE.md ../CLAUDE.md` (run from `repo/workflows/`), or just eyeball both side by side.
2. Apply the same edit to both files in the same pass — don't let them drift.
3. Keep both to current-state facts only. Don't add pass-by-pass writeups to either copy — new history entries belong in `docs/CHANGELOG.md`, with at most a one-line pointer added here if the current-state facts actually changed.
