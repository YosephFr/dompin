# Contributing to DOMPin

Thanks for your interest. This is a young project, so the contribution surface is broad and the bar is mostly: keep it tidy, keep it documented, keep it testable.

## Development setup

Requirements:

- Node 20+
- pnpm 9+
- Chrome (or any Chromium-based browser) for extension testing

```bash
git clone https://github.com/YosephFr/dompin.git
cd dompin
pnpm install
pnpm build
pnpm typecheck
```

## Running the extension locally

```bash
pnpm --filter @dompin/extension dev
```

Then load `packages/extension/dist` as an unpacked extension at `chrome://extensions`. Open the extension's options page once to pick a vault folder before exercising the picker.

## Code style

- TypeScript strict, no implicit `any`.
- Prefer many small files (200-400 lines typical, 800 max).
- No comments unless they explain a non-obvious _why_.
- Run `pnpm format` before committing.

## Pull requests

- Branch from `main`, name it `feat/<scope>` or `fix/<scope>`.
- One concern per PR. Multiple small PRs beat one giant one.
- Describe the problem and the solution. Include screenshots or a short clip when the change is visible.
- New features should ship with at least one test, where applicable.

## Reporting bugs

Use the issue templates. Include browser version, extension version, OS, and a console log if relevant. If the bug involves the vault folder, mention the operating system and the folder location (no contents).
