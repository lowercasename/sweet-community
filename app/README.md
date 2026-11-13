# Sweet iOS app (exploration)

This folder wraps Sweet in a native iOS app with Capacitor. The app opens one Sweet instance in a web view. The instance serves the web app, so the app always runs the version that the server has.

`capacitor.config.json` sets the instance address in `server.url`. It is the Vite dev server here, so `pnpm dev` in `web` must be running.

```
pnpm install
pnpm exec cap run ios
```

This needs Xcode. Android is not set up.
