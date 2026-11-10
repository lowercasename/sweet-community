// Package preview fetches a link's preview: the title, description, site name and picture that a page gives in its
// OpenGraph tags, as messaging apps show them.
package preview

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"code.dny.dev/ssrf"
	"golang.org/x/net/html"
)

const (
	maxTitle       = 200
	maxDescription = 300
	maxSiteName    = 100
	// The tags are in the page's head, so at most the first megabyte of a page is read.
	maxPageBytes = 1 << 20
	// MaxImageBytes is the largest picture that is downloaded.
	MaxImageBytes = 5 << 20
	timeout       = 8 * time.Second
	maxRedirects  = 3
	userAgent     = "Mozilla/5.0 (compatible; SweetLinkPreview/1.0; +https://sweet.community)"
)

// ErrNoPreview means that the address gives no preview: it is not http or https, it cannot be fetched, it is not an
// HTML page, or the page gives no title.
var ErrNoPreview = errors.New("no preview")

// Preview is what a page says about itself. ImageURL is the address of its picture, or empty.
type Preview struct {
	URL         string
	Title       string
	Description string
	SiteName    string
	ImageURL    string
}

// Client returns the HTTP client for previews. Its dialer refuses internal and special-purpose addresses, and every
// port but 80 and 443 (code.dny.dev/ssrf). The check runs on the address after DNS resolution, so a name that points
// at an internal address is refused too. Redirects are checked the same way, and at most three are followed.
func Client() *http.Client {
	dialer := &net.Dialer{Timeout: timeout, Control: ssrf.New().Safe}
	transport := &http.Transport{
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   timeout,
		ResponseHeaderTimeout: timeout,
		MaxIdleConns:          10,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return errors.New("too many redirects")
			}
			return nil
		},
	}
}

// get requests an http or https address and returns the response if its status is 2xx and its media type is one of
// types. The caller closes the body.
func get(ctx context.Context, c *http.Client, rawURL, accept string, types ...string) (*http.Response, error) {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, ErrNoPreview
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrNoPreview, err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", accept)
	res, err := c.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrNoPreview, err)
	}
	media, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
	ok := res.StatusCode >= 200 && res.StatusCode < 300
	if ok {
		ok = false
		for _, t := range types {
			if media == t || (strings.HasSuffix(t, "/") && strings.HasPrefix(media, t)) {
				ok = true
			}
		}
	}
	if !ok {
		res.Body.Close()
		return nil, fmt.Errorf("%w: status %d, type %q", ErrNoPreview, res.StatusCode, media)
	}
	return res, nil
}

// Fetch reads the page at rawURL with c and returns its preview, or ErrNoPreview.
func Fetch(ctx context.Context, c *http.Client, rawURL string) (Preview, error) {
	res, err := get(ctx, c, rawURL, "text/html,application/xhtml+xml", "text/html", "application/xhtml+xml")
	if err != nil {
		return Preview{}, err
	}
	defer res.Body.Close()
	// A relative picture address is resolved against the page's final address, after any redirects.
	p, err := parse(io.LimitReader(res.Body, maxPageBytes), res.Request.URL.String())
	if err != nil {
		return Preview{}, err
	}
	p.URL = rawURL
	return p, nil
}

// FetchImage downloads the picture at rawURL with c. It refuses anything that is not an image or is larger than
// MaxImageBytes.
func FetchImage(ctx context.Context, c *http.Client, rawURL string) ([]byte, error) {
	res, err := get(ctx, c, rawURL, "image/*", "image/")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, MaxImageBytes+1))
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrNoPreview, err)
	}
	if len(data) > MaxImageBytes {
		return nil, fmt.Errorf("%w: picture larger than %d bytes", ErrNoPreview, MaxImageBytes)
	}
	return data, nil
}

// parse reads the page's head. OpenGraph tags come first. Twitter's tags, the <title> and the meta description fill
// gaps. The site name falls back to the host without www. Reading stops at the end of the head or the start of the
// body.
func parse(r io.Reader, base string) (Preview, error) {
	z := html.NewTokenizer(r)
	meta := map[string]string{}
	title, inTitle := "", false
read:
	for {
		switch z.Next() {
		case html.ErrorToken:
			break read
		case html.StartTagToken, html.SelfClosingTagToken:
			name, hasAttr := z.TagName()
			switch string(name) {
			case "body":
				break read
			case "title":
				inTitle = true
			case "meta":
				var key, content string
				for hasAttr {
					var k, v []byte
					k, v, hasAttr = z.TagAttr()
					switch string(k) {
					case "property", "name":
						if key == "" {
							key = strings.ToLower(strings.TrimSpace(string(v)))
						}
					case "content":
						content = string(v)
					}
				}
				if key != "" && meta[key] == "" {
					meta[key] = clean(content)
				}
			}
		case html.TextToken:
			if inTitle && title == "" {
				title = clean(string(z.Text()))
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "title":
				inTitle = false
			case "head":
				break read
			}
		}
	}
	pick := func(keys ...string) string {
		for _, k := range keys {
			if v := meta[k]; v != "" {
				return v
			}
		}
		return ""
	}
	p := Preview{URL: base}
	p.Title = cut(pick("og:title", "twitter:title"), maxTitle)
	if p.Title == "" {
		p.Title = cut(title, maxTitle)
	}
	if p.Title == "" {
		return Preview{}, ErrNoPreview
	}
	p.Description = cut(pick("og:description", "twitter:description", "description"), maxDescription)
	baseURL, err := url.Parse(base)
	if err != nil {
		return Preview{}, ErrNoPreview
	}
	p.SiteName = cut(pick("og:site_name"), maxSiteName)
	if p.SiteName == "" {
		p.SiteName = strings.TrimPrefix(baseURL.Hostname(), "www.")
	}
	if img := pick("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"); img != "" {
		if ref, err := url.Parse(img); err == nil {
			if abs := baseURL.ResolveReference(ref); abs.Scheme == "http" || abs.Scheme == "https" {
				p.ImageURL = abs.String()
			}
		}
	}
	return p, nil
}

// clean collapses runs of white space into single spaces and trims the ends.
func clean(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// cut shortens s to at most n characters.
func cut(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return strings.TrimSpace(string(r[:n]))
	}
	return s
}
