package api

import (
	"context"
	"database/sql"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/store"

	"github.com/google/uuid"
)

// makeOwner creates the owner's account with a password, for the tests. A real instance creates its owner through the
// setup link.
func makeOwner(ctx context.Context, d *sql.DB, username, password string) error {
	q := store.New(d)
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	now := db.Now()
	if err := q.CreateUser(ctx, store.CreateUserParams{ID: id.String(), Username: username, CreatedAt: now}); err != nil {
		return err
	}
	if err := q.CreateMembership(ctx, store.CreateMembershipParams{GroupID: perm.Root, UserID: id.String(), Role: perm.Owner, JoinedAt: now}); err != nil {
		return err
	}
	h, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	return q.SetUserPassword(ctx, store.SetUserPasswordParams{PasswordHash: sql.NullString{String: h, Valid: true}, ID: id.String()})
}
