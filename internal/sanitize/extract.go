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

// Images returns the ids of the images in a sanitised body, from the src="/img/<id>" of its <img> elements, without
// repeats. An id written as text or in a link is not an image.
func Images(sanitised string) []string {
	root, err := html.Parse(strings.NewReader(sanitised))
	if err != nil {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "img" {
			for _, a := range n.Attr {
				if id, ok := strings.CutPrefix(a.Val, "/img/"); a.Key == "src" && ok && !seen[id] {
					seen[id] = true
					out = append(out, id)
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

// EmbedLinks returns the addresses of the links that a sanitised body shows as preview cards, without repeats. A card
// is a paragraph marked data-embed that holds one link.
func EmbedLinks(sanitised string) []string {
	if !strings.Contains(sanitised, "data-embed") {
		return nil
	}
	root, err := html.Parse(strings.NewReader(sanitised))
	if err != nil {
		return nil
	}
	var out []string
	seen := map[string]bool{}
	var walk func(*html.Node, bool)
	walk = func(n *html.Node, inCard bool) {
		if n.Type == html.ElementNode && n.Data == "p" {
			for _, a := range n.Attr {
				if a.Key == "data-embed" {
					inCard = true
				}
			}
		}
		if inCard && n.Type == html.ElementNode && n.Data == "a" {
			for _, a := range n.Attr {
				if a.Key == "href" && a.Val != "" && !seen[a.Val] {
					seen[a.Val] = true
					out = append(out, a.Val)
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c, inCard)
		}
	}
	walk(root, false)
	return out
}
