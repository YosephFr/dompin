# DOMPin Git helper

DOMPin can save a local Git history inside each session folder. Chrome extensions cannot run
`git` directly, so this uses a Native Messaging host.

## Requirements

- Git available on the local machine.
- DOMPin loaded in Chrome.
- The vault absolute path configured in DOMPin Options.
- Native host manifest installed for the current Chrome profile.

## macOS install

From the repository root:

```sh
native/install-macos.sh <chrome-extension-id>
```

The extension ID is shown in DOMPin Options under Local Git history, and also at
`chrome://extensions` after enabling Developer mode.

Then open DOMPin Options:

1. Enable `Enable automatic Git checkpoints`.
2. Keep helper name as `com.yosephfr.dompin_git`.
3. Set `Vault absolute path`, for example `/Users/franco/anotaciones`.

Each session folder becomes its own local Git repository. DOMPin commits the whole session folder
after annotation add, edit, delete, and recorded-session export.
