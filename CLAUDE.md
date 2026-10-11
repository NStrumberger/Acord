# Acord: notes for agents

## Always work from GitHub, not a local copy

The source of truth is **https://github.com/NStrumberger/Acord** (branch `main`).
Before doing anything, clone it or `git pull` it. Don't trust whatever copy happens
to be on disk.

Why this note exists: an old copy in iCloud Drive (`iCloudDrive\Projects\Acord`)
was damaged by sync. `.git` became unreadable, `scripts/` turned up inside
`.git\scripts 2\`, and a stray `objects/` folder appeared at the root. That copy
looked complete but was neither runnable nor current. If you find a local copy
like that, don't repair it or build on it: clone fresh from GitHub, outside any
synced folder (iCloud, OneDrive, Dropbox).

Pushing to `main` deploys to GitHub Pages, so commit and push only when asked.

## Where to start reading

- `README.md`: what Acord does and how to run it.
- `notes/`: what was measured and what went wrong. Don't re-derive those
  numbers.
