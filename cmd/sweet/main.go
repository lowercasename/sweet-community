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
	"sweet/internal/web"
)

//go:embed migrations
var migrationsFS embed.FS

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dbPath := flag.String("db", "data/sweet.db", "SQLite database path")
	owner := flag.String("owner", "owner", "username of the single PoC user")
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

	me, err := api.EnsureOwner(ctx, d, *owner)
	if err != nil {
		log.Fatalf("owner: %v", err)
	}

	hub := events.NewHub(d)
	srv := &api.Server{DB: d, Hub: hub, Owner: me}

	mux := http.NewServeMux()
	srv.Routes(mux)
	mux.Handle("/", web.Handler())

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
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
