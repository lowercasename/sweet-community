// Command sweet is one Sweet instance: HTTP server, SQLite, embedded frontend.
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sweet/internal/api"
	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/images"
	"sweet/internal/web"
)

// imageStore picks S3 when SWEET_S3_ENDPOINT and SWEET_S3_BUCKET are set
// (R2: <account>.r2.cloudflarestorage.com, region auto), else a directory.
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

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "data/sweet.db", "SQLite database path")
	owner := flag.String("owner", "owner", "username of the instance owner")
	ownerPassword := flag.String("owner-password", os.Getenv("SWEET_OWNER_PASSWORD"),
		"owner's initial password (or SWEET_OWNER_PASSWORD); used only until the owner has one")
	imagesDir := flag.String("images-dir", "data/images", "directory for uploaded images when SWEET_S3_* is not set")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	d, err := db.Open(*dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer d.Close()

	// go:embed can't reach ../../migrations, so main.go lives beside a copy;
	// see the Makefile, which syncs migrations/ into cmd/sweet/migrations/.
	migrations, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Migrate(ctx, d, migrations); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	me, err := api.EnsureOwner(ctx, d, *owner, *ownerPassword)
	if err != nil {
		log.Fatalf("owner: %v", err)
	}
	if !api.OwnerHasPassword(ctx, d, *owner) {
		log.Printf("WARNING: owner %q has no password and cannot sign in; restart with -owner-password or SWEET_OWNER_PASSWORD", *owner)
	}

	imgStore, err := imageStore(*imagesDir)
	if err != nil {
		log.Fatalf("images: %v", err)
	}

	// Unreferenced images go after a day: long enough for any draft.
	go images.SweepEvery(ctx, d, imgStore, time.Hour, 24*time.Hour, log.Printf)

	hub := events.NewHub(d)
	srv := &api.Server{DB: d, Hub: hub, Images: imgStore}

	mux := http.NewServeMux()
	srv.Routes(mux)
	mux.Handle("/", web.Handler())

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           api.Protect(mux),
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: SSE connections are long-lived by design.
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpSrv.Shutdown(shutdownCtx)
	}()

	log.Printf("sweet listening on %s (db %s, owner %s)", *addr, *dbPath, me.Username)
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
