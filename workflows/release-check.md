# Release check

The gate to run right before pushing to `main` and right after — `ship-feature.md` covers idea-to-commit; this picks up from "about to push" through "confirmed live." `git push` to `main` is the deploy trigger (`../CLAUDE.md`'s Deployment section), so there's no separate release step to remember beyond this.

1. **Clean tree.** `git status` — confirm nothing unintended is staged and nothing intended was left uncommitted. If a user reports a documented fix isn't visible on the real site, this (an uncommitted backlog) has been the actual cause before, not the fix itself — check here first.
2. **Local gate, before CI's.** `npm test` and `npm run test:e2e` — catch a failure here rather than waiting on Actions to report it; CI runs the same two.
3. **Production build.** `npm run build` (matches CI's `NODE_ENV=production`) — confirms `check:sprite` and the bundle both succeed locally.
4. **Docs current**: outer-workspace pointers still route correctly if this change moved/renamed anything they reference (`sync-agent-entry-docs.md`), `docs/CHANGELOG.md` has an entry, the relevant `docs/specs/*.md` reflects what actually shipped.
5. **Push**, then confirm the deploy workflow itself succeeded rather than assuming green-push-means-deployed:
   ```
   gh run list --workflow=deploy.yml --limit 1
   ```
6. **Confirm live**, not just deployed. "Live-verified" elsewhere in this repo's history means checked against a local `dist/` build — that is *not* the same claim as checked on the real site. For anything visual or interactive, load https://dogexe.github.io/whereisit/ directly and confirm the specific change is actually there (a hard refresh may be needed — `sw.js`'s `CACHE_NAME` governs when a cached shell gets invalidated for returning visitors).
