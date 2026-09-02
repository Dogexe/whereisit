<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="icons/lockup-dark.png">
  <img src="icons/lockup-light.png" height="64" alt="whereisit" />
</picture>

Personal income & expense tracker with Google sign-in, cross-device sync, budgets, recurring bills, and savings goals — installable as a PWA.

**[Open the app →](https://dogexe.github.io/whereisit/)**

![Made with JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

</div>

## Features

- **Google sign-in** — data syncs automatically across every device you're signed into, scoped privately to your account (Postgres row-level security)
- **Transactions** — add, edit, delete; category is auto-guessed from what you type in the note
- **Budgets** — per-category monthly limits, with a warning as you approach or go over
- **Recurring bills** — see what's due in the next 7 days on the home screen and mark it paid in one tap, which logs the transaction for you
- **Savings goals** — set a target, add funds over time, watch the progress bar fill
- **Insights** — budget progress, a category breakdown with a donut chart, and a 6-month income/expense trend
- **Data export** — CSV, JSON, or a fresh Google Sheet, on demand
- **Light/dark mode**
- **Thai / English** interface
- **Installable PWA** — add to your home screen, keeps working offline
- **Responsive** — mobile-first bottom nav, wider multi-column layout on desktop

## Tech

Vanilla HTML/CSS/JavaScript (ES modules), no framework — bundled with [esbuild](https://esbuild.github.io/) and deployed by a GitHub Actions workflow. Data and auth run on [Supabase](https://supabase.com/) (Postgres + Google OAuth); the Google Sheets export talks to Google's Sheets API directly via Google Identity Services. Hosting is [GitHub Pages](https://pages.github.com/); offline/installability comes from a small hand-written service worker and web manifest.

---

<sub>Built with <a href="https://claude.com/claude-code">Claude Code</a>.</sub>
