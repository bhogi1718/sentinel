import { useEffect } from "react";

const DEFAULT_TITLE = "Sentinel";

function setMeta(name: string, content: string, attribute: "name" | "property" = "name"): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

/// Sets the page title and description (also used for link previews) while
/// a page is shown, restoring the default title when it goes.
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const fullTitle = title === DEFAULT_TITLE ? title : `${title} - ${DEFAULT_TITLE}`;
    document.title = fullTitle;
    setMeta("description", description);
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", description, "property");
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description]);
}
