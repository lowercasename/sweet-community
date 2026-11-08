// Package sanitize holds the one bluemonday policy that every body (post,
// comment, chat message) passes through before storage. The policy defines
// the schema of a body. A body may contain exactly what the policy allows.
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
	// relRe accepts TipTap's default rel value and the rel value this policy
	// adds to a link that has none. The second keeps a post created via the
	// API stable once it has been edited in TipTap.
	relRe = regexp.MustCompile(`^(noopener noreferrer nofollow|noreferrer noopener)$`)

	body  = newBodyPolicy()
	strip = bluemonday.StripTagsPolicy()
)

func newBodyPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()

	// Block elements that TipTap's StarterKit produces.
	p.AllowElements("p", "br", "h2", "h3", "blockquote", "ul", "ol", "li", "pre", "code", "hr")
	// Inline marks.
	p.AllowElements("strong", "em", "s", "u")

	// Links allow the http, https and mailto schemes only. TipTap emits exactly
	//   <a target="_blank" rel="noopener noreferrer nofollow" href="...">
	// and those two attribute values are accepted verbatim, so stored HTML is
	// byte-identical to editor output. The round-trip test depends on this.
	// A link without those attributes, such as one created via the API, gets
	// rel="noreferrer" added. If it is external, it also gets target="_blank"
	// and noopener in rel.
	p.AllowAttrs("href").OnElements("a")
	p.AllowAttrs("target").Matching(targetRe).OnElements("a")
	p.AllowAttrs("rel").Matching(relRe).OnElements("a")
	p.AllowURLSchemes("http", "https", "mailto")
	p.RequireParseableURLs(true)
	p.AllowRelativeURLs(true) // required for the /img/<id> paths. href is still scheme-checked.
	p.RequireNoFollowOnLinks(false)
	p.RequireNoReferrerOnLinks(true)
	p.AddTargetBlankToFullyQualifiedLinks(true)

	// A mention is <span data-type="mention" data-mention-id="<uuid>">@name</span>.
	p.AllowAttrs("data-type").Matching(mentionRe).OnElements("span")
	p.AllowAttrs("data-mention-id").Matching(uuidRe).OnElements("span")

	// Images allow the /img/<id> path only, with alt and integer dimensions.
	p.AllowAttrs("src").Matching(imgSrcRe).OnElements("img")
	p.AllowAttrs("data-image-id").Matching(uuidRe).OnElements("img")
	p.AllowAttrs("alt").OnElements("img")
	p.AllowAttrs("width", "height").Matching(bluemonday.Integer).OnElements("img")

	// Nothing else is allowed. There are no class, style or id attributes, no
	// event handlers, no iframes and no scripts.
	return p
}

// MaxBodyBytes is the maximum size of an incoming body before sanitisation.
const MaxBodyBytes = 200 * 1024

// emptyParagraph matches a paragraph that holds nothing visible: only
// whitespace, non-breaking spaces (literal or as entities) or line breaks.
const emptyParagraph = `<p>(?:\s|\x{00a0}|&nbsp;|&#160;|<br\s*/?>)*</p>`

var (
	leadingEmpty  = regexp.MustCompile(`^(?:\s*` + emptyParagraph + `)+`)
	trailingEmpty = regexp.MustCompile(`(?:` + emptyParagraph + `\s*)+$`)
)

// Body sanitises TipTap HTML for storage. The result is trusted by all code
// after this point. Empty paragraphs at the start and end are removed
// (Raphael, 2026-11-08). Empty paragraphs between others are kept as spacing.
func Body(in string) string {
	s := strings.TrimSpace(body.Sanitize(in))
	s = leadingEmpty.ReplaceAllString(s, "")
	s = trailingEmpty.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

// Text returns the plain text of a sanitised body, for search and excerpts.
func Text(sanitised string) string {
	// Replace block boundaries with a space so that adjacent words stay separate.
	s := strings.NewReplacer("</p>", " ", "<br>", " ", "<br/>", " ", "</li>", " ", "</h2>", " ", "</h3>", " ", "</blockquote>", " ").Replace(sanitised)
	s = strip.Sanitize(s)
	s = html.UnescapeString(s)
	return strings.Join(strings.Fields(s), " ")
}

// IsEmpty reports whether a sanitised body has no visible content.
func IsEmpty(sanitised string) bool {
	return Text(sanitised) == "" && !strings.Contains(sanitised, "<img")
}
