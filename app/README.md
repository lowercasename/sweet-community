# Sweet mobile apps (exploration)

This folder wraps Sweet in native iOS and Android apps with Capacitor. The app opens one Sweet instance in a web view. The instance serves the web app, so the app always runs the version that the server has.

`capacitor.config.json` sets the instance address in `server.url`. It is the Vite dev server here, so `pnpm dev` in `web` must be running.

```
pnpm install
pnpm exec cap run ios
pnpm exec cap run android --forwardPorts 5173:5173
```

iOS needs Xcode. Android needs Android Studio and JDK 21. Capacitor 8's Gradle does not run on the JDK 25 that Android Studio includes, so set `JAVA_HOME` to JDK 21 and choose it as the Gradle JDK in Android Studio. `--forwardPorts` lets the emulator reach the dev server at `localhost`.
