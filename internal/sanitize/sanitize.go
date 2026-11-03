// Package sanitize holds the one bluemonday policy that every body (post,
// comment, chat message) passes through before storage. The policy is the
// schema: what it allows is exactly what a body may contain.
package sanitize

import (
	"html"
	"regexp"
	"strings"

	"github.com/microcosm-cc/bluemonday"
)

var (
	uuidRe    = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	mentionRe = regexp.MustCompile(`^mention$`)
	imgSrcRe  = regexp.MustCompile(`^/img/[0-9a-fA-F-]{36}$`)
	targetRe  = regexp.MustCompile(`^_blank$`)
	// TipTap's default rel, and the rel this policy itself adds to a bare link
	// (so a post made via the API is stable once it has been edited in TipTap).
	relRe = regexp.MustCompile(`^(noopener noreferrer nofollow|noreferrer noopener)$`)

	body  = newBodyPolicy()
	strip = bluemonday.StripTagsPolicy()
)

func newBodyPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()

	// Block structure TipTap's StarterKit produces.
	p.AllowElements("p", "br", "h2", "h3", "blockquote", "ul", "ol", "li", "pre", "code", "hr")
	// Inline marks.
	p.AllowElements("strong", "em", "s", "u")

	// Links: http(s) and mailto only. TipTap emits exactly
	//   <a target="_blank" rel="noopener noreferrer nofollow" href="...">
	// and those two attribute values are accepted verbatim, so stored HTML is
	// byte-identical to editor output (the round-trip test depends on this).
	// A link that arrives without them (API-authored) gets rel="noreferrer"
	// and, if external, target="_blank" rel="... noopener" added.
	p.AllowAttrs("href").OnElements("a")
	p.AllowAttrs("target").Matching(targetRe).OnElements("a")
	p.AllowAttrs("rel").Matching(relRe).OnElements("a")
	p.AllowURLSchemes("http", "https", "mailto")
	p.RequireParseableURLs(true)
	p.AllowRelativeURLs(true) // needed for our own /img/<id> paths; href is still scheme-checked
	p.RequireNoFollowOnLinks(false)
	p.RequireNoReferrerOnLinks(true)
	p.AddTargetBlankToFullyQualifiedLinks(true)

	// Mentions: <span data-type="mention" data-mention-id="<uuid>">@name</span>
	p.AllowAttrs("data-type").Matching(mentionRe).OnElements("span")
	p.AllowAttrs("data-mention-id").Matching(uuidRe).OnElements("span")

	// Images: our own /img/<id> path only, with alt and bounded dimensions.
	p.AllowAttrs("src").Matching(imgSrcRe).OnElements("img")
	p.AllowAttrs("data-image-id").Matching(uuidRe).OnElements("img")
	p.AllowAttrs("alt").OnElements("img")
	p.AllowAttrs("width", "height").Matching(bluemonday.Integer).OnElements("img")

	// Nothing else: no class, style, id, event handlers, iframes, scripts.
	return p
}

// MaxBodyBytes is the hard cap on an incoming body before sanitisation.
const MaxBodyBytes = 200 * 1024

// Body sanitises TipTap HTML for storage. The result is trusted everywhere
// after this point.
func Body(in string) string {
	return strings.TrimSpace(body.Sanitize(in))
}

// Text returns the plain text of a sanitised body, for search and excerpts.
func Text(sanitised string) string {
	// Give block boundaries a space so words don't run together.
	s := strings.NewReplacer("</p>", " ", "<br>", " ", "<br/>", " ", "</li>", " ", "</h2>", " ", "</h3>", " ", "</blockquote>", " ").Replace(sanitised)
	s = strip.Sanitize(s)
	s = html.UnescapeString(s)
	return strings.Join(strings.Fields(s), " ")
}

// IsEmpty reports whether a sanitised body has no visible content.
func IsEmpty(sanitised string) bool {
	return Text(sanitised) == "" && !strings.Contains(sanitised, "<img")
}
