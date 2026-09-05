# Sync the outer workspace's entry-doc pointers

This repo commits its own `CLAUDE.md` and `AGENTS.md` at its root — every
path in both files is relative to *this* repository, so a standalone clone
of `whereisit` (or a Claude/Codex session opened at this repo's root) needs
nothing else to find them.

The maintainer also works from a local, uncommitted multi-repo workspace one
directory above this repo, alongside an unrelated sibling checkout
(`profile-repo/`). A session started at that outer level auto-loads whatever
`CLAUDE.md`/`AGENTS.md` live there, so the outer workspace keeps its own thin
pointer copies of each — short files whose job is only to say "the real
guidance is in this repo's own `CLAUDE.md`/`AGENTS.md`" and name this repo's
directory. Those outer files are not part of this git repo and are not kept
byte-identical to the copies here; they only need enough content to route a
session back to the right place.

Whenever this repo's own `CLAUDE.md` or `AGENTS.md` changes in a way that
would change how a reader gets here (renamed file, moved repo, changed
directory layout), update the matching outer pointer file so it still routes
correctly. Content changes that are purely about this repo's own
architecture or workflow don't need any outer-file update at all.
