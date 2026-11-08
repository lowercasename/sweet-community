// Package push sends web push notifications (architecture.md,
// Notifications): a short message to each device a person asked to be
// notified on, for a mention or a comment on their post. The browser's
// subscription is kept as it describes it; a device the push service says
// is gone is dropped.
package push

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"

	"sweet/internal/store"
)

// Subscription is one device, as the browser's PushManager describes it.
type Subscription struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// Payload is what the service worker shows: a title, a line, and where a tap goes.
type Payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

// Sender delivers one payload to one device. gone is true when the push
// service says the device no longer exists, which drops the subscription.
type Sender interface {
	Send(ctx context.Context, sub Subscription, data []byte) (gone bool, err error)
}

// Keys are the instance's VAPID pair, made once and kept in settings.
type Keys struct {
	Public, Private string
}

const (
	keyPublic  = "vapid_public"
	keyPrivate = "vapid_private"
)

// LoadKeys reads the instance's keys, making them on first use.
func LoadKeys(ctx context.Context, d *sql.DB) (Keys, error) {
	q := store.New(d)
	pub, err1 := q.GetSetting(ctx, keyPublic)
	priv, err2 := q.GetSetting(ctx, keyPrivate)
	if err1 == nil && err2 == nil && pub != "" && priv != "" {
		return Keys{Public: pub, Private: priv}, nil
	}
	if (err1 != nil && !errors.Is(err1, sql.ErrNoRows)) || (err2 != nil && !errors.Is(err2, sql.ErrNoRows)) {
		return Keys{}, errors.Join(err1, err2)
	}
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return Keys{}, err
	}
	if err := q.SetSetting(ctx, store.SetSettingParams{Key: keyPublic, Value: pub}); err != nil {
		return Keys{}, err
	}
	if err := q.SetSetting(ctx, store.SetSettingParams{Key: keyPrivate, Value: priv}); err != nil {
		return Keys{}, err
	}
	return Keys{Public: pub, Private: priv}, nil
}

// WebPush is the real sender: the Web Push protocol with VAPID, through the
// browser vendors' push services.
type WebPush struct {
	Keys Keys
	// Subscriber is who to contact about this sender: a mailto: or the instance's address.
	Subscriber string
}

func (w WebPush) Send(ctx context.Context, sub Subscription, data []byte) (bool, error) {
	res, err := webpush.SendNotificationWithContext(ctx, data, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      w.Subscriber,
		VAPIDPublicKey:  w.Keys.Public,
		VAPIDPrivateKey: w.Keys.Private,
		TTL:             int((24 * time.Hour).Seconds()),
		Urgency:         webpush.UrgencyNormal,
	})
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, res.Body)
	switch {
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		return true, nil
	case res.StatusCode >= 400:
		return false, fmt.Errorf("push service answered %d", res.StatusCode)
	}
	return false, nil
}

// Pusher tells a person's devices. It is safe to call from a goroutine
// after the transaction that made the notification has committed.
type Pusher struct {
	DB   *sql.DB
	Send Sender
	// Timeout bounds each delivery; zero means ten seconds.
	Timeout time.Duration
}

// Tell sends the payload to every device of the person, dropping the ones
// that are gone. Errors from the push service are returned joined, after
// every device has been tried.
func (p *Pusher) Tell(ctx context.Context, userID string, payload Payload) error {
	q := store.New(p.DB)
	subs, err := q.ListPushSubscriptions(ctx, userID)
	if err != nil {
		return err
	}
	if len(subs) == 0 {
		return nil
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	timeout := p.Timeout
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	var errs []error
	for _, s := range subs {
		sctx, cancel := context.WithTimeout(ctx, timeout)
		gone, err := p.Send.Send(sctx, Subscription{Endpoint: s.Endpoint, P256dh: s.P256dh, Auth: s.Auth}, data)
		cancel()
		if gone {
			if err := q.DeletePushSubscription(ctx, store.DeletePushSubscriptionParams{Endpoint: s.Endpoint, UserID: ""}); err != nil {
				errs = append(errs, err)
			}
			continue
		}
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", s.Endpoint, err))
		}
	}
	return errors.Join(errs...)
}

// Subscribe keeps a device for a person, replacing an older record of the same endpoint.
func Subscribe(ctx context.Context, d *sql.DB, userID string, sub Subscription, now int64) error {
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	return store.New(d).CreatePushSubscription(ctx, store.CreatePushSubscriptionParams{
		ID: id.String(), UserID: userID, Endpoint: sub.Endpoint, P256dh: sub.P256dh, Auth: sub.Auth, CreatedAt: now,
	})
}

// Unsubscribe drops one device of a person.
func Unsubscribe(ctx context.Context, d *sql.DB, userID, endpoint string) error {
	return store.New(d).DeletePushSubscription(ctx, store.DeletePushSubscriptionParams{Endpoint: endpoint, UserID: userID})
}
