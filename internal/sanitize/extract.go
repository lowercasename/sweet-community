package sanitize

import (
	"strings"

	"golang.org/x/net/html"
)

// This file extracts data from a sanitised body. It
// walks the parsed tree for mention ids. Hashtag extraction is not written
// until the decision between tags and topics is made.

// Mentions returns the ids of the users mentioned in a sanitised body, each once, in document order.
func Mentions(sanitised string) []string {
	root, err := html.Parse(strings.NewReader(sanitised))
	if err != nil {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "span" {
			for _, a := range n.Attr {
				if a.Key == "data-mention-id" && a.Val != "" && !seen[a.Val] {
					seen[a.Val] = true
					out = append(out, a.Val)
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return out
}
