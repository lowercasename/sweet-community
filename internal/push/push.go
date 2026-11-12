// Package push sends web push notifications.
// For a mention or a comment on the user's post, it sends a short message to
// each device the user has subscribed. The browser's subscription is stored
// as the browser describes it. A subscription the push service reports as
// gone is deleted.
package push

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"

	"sweet/internal/store"
)

// Subscription is one device's push subscription, as the browser's PushManager describes it.
type Subscription struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// Payload is the content the service worker shows. It has a title, a body line, and the URL opened on tap.
type Payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	// Tag groups pushes on a device. A new push with the same tag replaces the
	// one currently shown, so a conversation produces one notification rather
	// than several.
	Tag string `json:"tag,omitempty"`
}

// Sender delivers one payload to one device. gone is true when the push
// service reports that the subscription no longer exists. The caller then
// deletes the subscription.
type Sender interface {
	Send(ctx context.Context, sub Subscription, data []byte) (gone bool, err error)
}

// Keys is the instance's VAPID key pair. It is generated once and stored in settings.
type Keys struct {
	Public, Private string
}

const (
	keyPublic  = "vapid_public"
	keyPrivate = "vapid_private"
)

// LoadKeys reads the instance's keys. On first use it generates and stores them.
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

// WebPush is the production Sender. It uses the Web Push protocol with VAPID
// through the browser vendors' push services.
type WebPush struct {
	Keys Keys
	// Subscriber is the contact for this sender, either a mailto: URL or the instance's address.
	Subscriber string
}

func (w WebPush) Send(ctx context.Context, sub Subscription, data []byte) (bool, error) {
	res, err := webpush.SendNotificationWithContext(ctx, data, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		// Firefox on Android rejects the library's default 4096-byte padded payload.
		RecordSize:      2048,
		Subscriber:      w.Subscriber,
		VAPIDPublicKey:  w.Keys.Public,
		VAPIDPrivateKey: w.Keys.Private,
		TTL:             int((24 * time.Hour).Seconds()),
		Urgency:         webpush.UrgencyNormal,
		HTTPClient:      noRedirects,
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

// Pusher sends a payload to a user's devices. It is safe to call from a
// goroutine after the transaction that created the notification has committed.
type Pusher struct {
	DB   *sql.DB
	Send Sender
	// Timeout is the limit for each delivery. Zero means ten seconds.
	Timeout time.Duration
}

// Tell sends the payload to every device of the user and deletes the
// subscriptions that are gone. Every device is tried, and then the errors
// from the push service are returned joined.
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
			// The endpoint's path identifies the device, so only its host is logged.
			host := s.Endpoint
			if u, perr := url.Parse(s.Endpoint); perr == nil {
				host = u.Host
			}
			errs = append(errs, fmt.Errorf("%s: %w", host, err))
		}
	}
	return errors.Join(errs...)
}

// MaxSubscriptions is how many devices one user can subscribe. Subscribing
// another device deletes the oldest subscription.
const MaxSubscriptions = 10

// Subscribe stores a device subscription for a user, replacing an older record with the same endpoint. The caller
// checks the endpoint with AllowedEndpoint first.
func Subscribe(ctx context.Context, d *sql.DB, userID string, sub Subscription, now int64) error {
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	q := store.New(d)
	if err := q.CreatePushSubscription(ctx, store.CreatePushSubscriptionParams{
		ID: id.String(), UserID: userID, Endpoint: sub.Endpoint, P256dh: sub.P256dh, Auth: sub.Auth, CreatedAt: now,
	}); err != nil {
		return err
	}
	return q.TrimPushSubscriptions(ctx, store.TrimPushSubscriptionsParams{UserID: userID, Keep: MaxSubscriptions})
}

// pushHosts are the push services of the browsers Sweet supports: Chrome and the other Chromium browsers, Firefox,
// Safari, and Edge on Windows, whose hosts end in notify.windows.com.
var pushHosts = map[string]bool{
	"fcm.googleapis.com":                true,
	"android.googleapis.com":            true,
	"updates.push.services.mozilla.com": true,
	"web.push.apple.com":                true,
}

// AllowedEndpoint reports whether a subscription's endpoint is an https address on a browser's push service, on the
// default port. The server sends a request to every stored endpoint, so any other address would let a user make the
// server send requests to hosts of their choice.
func AllowedEndpoint(endpoint string) bool {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return pushHosts[host] || strings.HasSuffix(host, ".notify.windows.com")
}

// noRedirects is the HTTP client for push deliveries. A push service answers directly and never redirects, so a
// redirect is refused rather than followed to another host.
var noRedirects = &http.Client{
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// Unsubscribe deletes one device subscription of a user.
func Unsubscribe(ctx context.Context, d *sql.DB, userID, endpoint string) error {
	return store.New(d).DeletePushSubscription(ctx, store.DeletePushSubscriptionParams{Endpoint: endpoint, UserID: userID})
}
