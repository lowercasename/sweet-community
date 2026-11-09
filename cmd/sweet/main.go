// Command sweet runs one Sweet instance. It is the HTTP server, the SQLite
// database and the embedded frontend.
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"sweet/internal/api"
	"sweet/internal/db"
	"sweet/internal/digest"
	"sweet/internal/events"
	"sweet/internal/images"
	"sweet/internal/mail"
	"sweet/internal/push"
	"sweet/internal/version"
	"sweet/internal/web"
)

// imageStore returns an S3 store when SWEET_S3_ENDPOINT and SWEET_S3_BUCKET
// are set (for R2, the endpoint is <account>.r2.cloudflarestorage.com and the
// region is auto). Otherwise it returns a local directory store.
func imageStore(dir string) (images.Store, error) {
	if ep, bucket := os.Getenv("SWEET_S3_ENDPOINT"), os.Getenv("SWEET_S3_BUCKET"); ep != "" && bucket != "" {
		return images.NewS3(images.S3Config{
			Endpoint:  ep,
			Bucket:    bucket,
			AccessKey: os.Getenv("SWEET_S3_ACCESS_KEY"),
			SecretKey: os.Getenv("SWEET_S3_SECRET_KEY"),
			Region:    os.Getenv("SWEET_S3_REGION"),
			Prefix:    os.Getenv("SWEET_S3_PREFIX"),
			Insecure:  os.Getenv("SWEET_S3_INSECURE") == "1",
		})
	}
	return images.NewLocal(dir)
}

//go:embed migrations
var migrationsFS embed.FS

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "data/sweet.db", "SQLite database path")
	owner := flag.String("owner", "owner", "username of the instance owner, when -owner-password makes one without the setup link")
	ownerPassword := flag.String("owner-password", os.Getenv("SWEET_OWNER_PASSWORD"),
		"the owner's password (or SWEET_OWNER_PASSWORD) for a scripted setup; without it a fresh instance prints a setup link")
	imagesDir := flag.String("images-dir", "data/images", "directory for uploaded images when SWEET_S3_* is not set")
	mailDir := flag.String("mail-dir", "data/mail", "directory that receives email as files when SWEET_SMTP_HOST is not set")
	baseURL := flag.String("base-url", envOr("SWEET_BASE_URL", "http://localhost:8080"), "the address links in email point at (or SWEET_BASE_URL)")
	sourceURL := flag.String("source-url", envOr("SWEET_SOURCE_URL", api.DefaultSourceURL),
		"where the Source code link points, the repository of the code this server runs (or SWEET_SOURCE_URL)")
	proxies, _ := strconv.Atoi(os.Getenv("SWEET_TRUST_PROXY"))
	trustProxy := flag.Int("trust-proxy", proxies,
		"the number of reverse proxies in front of Sweet that add the client's address to X-Forwarded-For, usually 1 (or SWEET_TRUST_PROXY)")
	litestream := flag.Bool("litestream", os.Getenv("SWEET_LITESTREAM") == "1",
		"Litestream replicates the database and owns its checkpoints (or SWEET_LITESTREAM=1)")
	showVersion := flag.Bool("version", false, "print the version of this binary and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println(version.Of())
		return
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var opts []db.Option
	if *litestream {
		opts = append(opts, db.LitestreamOwnsCheckpoints)
	}
	d, err := db.Open(*dbPath, opts...)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer d.Close()

	// go:embed cannot reference ../../migrations, so a copy is kept next to
	// main.go. The Makefile syncs migrations/ into cmd/sweet/migrations/.
	migrations, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Migrate(ctx, d, migrations); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	base := strings.TrimRight(*baseURL, "/")
	// The owner is created from the password when one is given. Otherwise,
	// on a new instance, the owner is whoever opens the setup link
	// (architecture.md, New-instance lifecycle).
	if *ownerPassword != "" {
		if _, err := api.EnsureOwner(ctx, d, *owner, *ownerPassword); err != nil {
			log.Fatalf("owner: %v", err)
		}
	}
	if needs, err := api.NeedsSetup(ctx, d); err != nil {
		log.Fatalf("owner: %v", err)
	} else if needs {
		link, err := api.SetupLink(ctx, d, base)
		if err != nil {
			log.Fatalf("setup link: %v", err)
		}
		log.Printf("SETUP: this community has no owner yet. Open %s to become its owner.", link)
	}

	imgStore, err := imageStore(*imagesDir)
	if err != nil {
		log.Fatalf("images: %v", err)
	}

	// Unreferenced images are deleted after a day, which is long enough for
	// any draft.
	go images.SweepEvery(ctx, d, imgStore, time.Hour, 24*time.Hour, log.Printf)

	sender := mail.FromEnv(*mailDir)
	// The weekly digest for users who have not visited (architecture.md, Notifications) is checked every hour.
	go digest.Every(ctx, d, sender, base, time.Hour, log.Printf)

	// The event log keeps a day of events (architecture.md, Realtime).
	go events.PruneEvery(ctx, d, time.Hour, log.Printf)

	hub := events.NewHub(d)
	hub.Version = version.Of()
	srv := &api.Server{DB: d, Hub: hub, Images: imgStore, Mail: sender, BaseURL: base, SourceURL: *sourceURL, ProxyHops: *trustProxy}
	// Web push (architecture.md, Notifications) uses the instance's VAPID keys, which are generated on first start.
	if keys, err := push.LoadKeys(ctx, d); err != nil {
		log.Printf("push: %v (push is off)", err)
	} else {
		srv.Push = &push.Pusher{DB: d, Send: push.WebPush{Keys: keys, Subscriber: base}}
		srv.PushKey = keys.Public
	}

	mux := http.NewServeMux()
	srv.Routes(mux)
	mux.Handle("/", web.Handler())

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           api.SecurityHeaders(api.Protect(mux)),
		ReadHeaderTimeout: 10 * time.Second,
		// There is no WriteTimeout, because SSE connections are long-lived by design.
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpSrv.Shutdown(shutdownCtx)
	}()

	log.Printf("sweet %s listening on %s (db %s)", version.Of(), *addr, *dbPath)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
