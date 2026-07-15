# Building Screeps SC from source

Step-by-step instructions to reproduce an exact copy of the add-on package that
was submitted to addons.mozilla.org.

## Build environment requirements

- **Operating system:** any Unix-like OS (macOS or Linux). On Windows, use WSL
  or Git Bash so that a POSIX shell is available.
- **Programs required:**
  - **A POSIX shell (`sh`)** — preinstalled on macOS and Linux.
  - **Node.js** — v18 or newer. Used only to rewrite `manifest.json` with a
    short inline script (JSON parse → delete keys → write). Install the LTS from
    <https://nodejs.org/> or via a package manager (`brew install node` on
    macOS, `apt install nodejs` on Debian/Ubuntu).
  - **Info-ZIP `zip`** — preinstalled on macOS; on Debian/Ubuntu install with
    `apt install zip`.
- **npm dependencies: none.** The build installs and uses **zero** third-party
  packages — you do **not** need to run `npm install`. (`package.json` /
  `package-lock.json` exist only for an optional ESLint developer setup and are
  not used by the build.)

### Versions used to produce the submitted package

- macOS (Darwin 25.5)
- Node.js v22.23.1
- npm 10.9.8 (not required by the build)
- Info-ZIP Zip 3.0

Any Node.js >= 18 and any Info-ZIP `zip` 3.x will produce an equivalent package.

## Build steps

1. Unpack this source archive (or `git clone https://github.com/kirkportas/Screeps-SC`).
2. From the project root, run the build script:

   ```sh
   ./build.sh
   ```

3. The script writes two packages to the project root:
   - **`screeps-sc-firefox.zip`** — the package submitted to addons.mozilla.org.
   - `screeps-sc-chrome.zip` — the equivalent package for the Chrome Web Store.

Upload `screeps-sc-firefox.zip` as the add-on.

## What the build does

`build.sh` copies the runtime files — `manifest.json`, `background.js`,
`content.js`, `module.js`, `settings.json`, `LICENSE`, and the `modules/`,
`options/`, `icons/`, and `vendor/` directories — into a staging directory
**unchanged**, then produces one zip per browser.

The **only** transformation is to `manifest.json`, and only by *deleting* keys
so each store gets a valid subset of the single cross-browser source manifest:

- Firefox package: `background.service_worker` removed (Firefox uses
  `background.scripts`).
- Chrome package: `background.scripts` and `browser_specific_settings` removed.

No source file is transpiled, concatenated, minified, or otherwise
machine-generated. The `.js`, `.html`, `.css`, and `.json` files in the package
are byte-for-byte identical to the ones in this source tree.

## Third-party code

The only bundled library is `vendor/mousetrap.min.js` — **Mousetrap v1.6.5,
unmodified**. It is the upstream distributed minified build, included as-is.

- Non-minified source: <https://github.com/ccampbell/mousetrap> (tag `1.6.5`)
- Project homepage: <https://craig.is/killing/mice>
