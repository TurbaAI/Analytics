# turbalance Analytics Mobile

This is a Capacitor shell for the static dashboard in the repository root.

## Quick Start

```sh
cd mobile/capacitor
npm install
npm run sync
npm run add:ios
npm run open:ios
```

For Android:

```sh
cd mobile/capacitor
npm install
npm run add:android
npm run open:android
```

The bundled app loads its UI from `www/` and fetches live telemetry from:

```text
http://100.95.183.13:8000/build/demo/live-machine-bundle.json
```

Change `mobile-config.js` if the dashboard host moves or if you switch to HTTPS.

## Notes

- Run `npm run sync:native` after changing the root dashboard files.
- The current endpoint is HTTP on a private network. For a production mobile app, use HTTPS.
- iOS may require an App Transport Security exception for HTTP endpoints.
