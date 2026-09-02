# Third-party code

`webmcp-polyfill.js` is vendored **unmodified** from
[`GoogleChromeLabs/webmcp-tools`](https://github.com/GoogleChromeLabs/webmcp-tools)
(`demos/shared/webmcp-polyfill.js`), Copyright 2026 Google LLC, licensed
**Apache-2.0**. Its licence header is intact at the top of the file; see
`LICENSE-APACHE-2.0` beside it for the full text.

Passbook itself is MIT. This file is kept separate, unmodified, and loaded as a
plain script rather than absorbed into `src/`, so the boundary between the two
licences stays obvious.

It is loaded before the app in `index.html` and installs `document.modelContext`
**only when the browser does not already provide one**, so a browser with native
WebMCP is untouched. `window.__webmcpNative` is recorded before it loads, which
is how the app tells a native context from a polyfilled one and says so on the
page rather than overclaiming.
