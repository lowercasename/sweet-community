package sanitize

import (
	"strings"

	"golang.org/x/net/html"
)

// distinct parses a sanitised body and returns the values that pick finds in its elements, each once, in document
// order. pick returns "" for an element it skips.
func distinct(sanitised string, pick func(*html.Node) string) []string {
	root, err := html.Parse(strings.NewReader(sanitised))
	if err != nil {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	for n := range root.Descendants() {
		if n.Type != html.ElementNode {
			continue
		}
		if v := pick(n); v != "" && !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// attr returns an element's attribute, or "" when it has none.
func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

// Mentions returns the ids of the users mentioned in a sanitised body.
func Mentions(sanitised string) []string {
	return distinct(sanitised, func(n *html.Node) string {
		if n.Data != "span" {
			return ""
		}
		return attr(n, "data-mention-id")
	})
}

// Images returns the ids of the images in a sanitised body, from the src="/img/<id>" of its <img> elements. An id
// written as text or in a link is not an image.
func Images(sanitised string) []string {
	return distinct(sanitised, func(n *html.Node) string {
		if n.Data != "img" {
			return ""
		}
		id, ok := strings.CutPrefix(attr(n, "src"), "/img/")
		if !ok {
			return ""
		}
		return id
	})
}

// EmbedLinks returns the addresses of the links that a sanitised body shows as preview cards. A card is a paragraph
// marked data-embed that holds one link.
func EmbedLinks(sanitised string) []string {
	return distinct(sanitised, func(n *html.Node) string {
		if n.Data != "a" || n.Parent == nil || n.Parent.Data != "p" || !hasAttr(n.Parent, "data-embed") {
			return ""
		}
		return attr(n, "href")
	})
}

// hasAttr reports whether an element has an attribute, which may be empty.
func hasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if a.Key == key {
			return true
		}
	}
	return false
}
