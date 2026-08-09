import { describe, expect, it } from "vitest";
import { escapeTelegramHtml, formatEventMessage } from "./telegram.messages";

describe("escapeTelegramHtml", () => {
  it("escapes ampersands, angle brackets", () => {
    expect(escapeTelegramHtml("<b>evil</b> & friends")).toBe("&lt;b&gt;evil&lt;/b&gt; &amp; friends");
  });

  it("does not double-escape an already-encoded ampersand sequence", () => {
    expect(escapeTelegramHtml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeTelegramHtml("My Laptop")).toBe("My Laptop");
  });
});

describe("formatEventMessage", () => {
  it("escapes a device name containing HTML before embedding it", () => {
    const message = formatEventMessage("<script>alert(1)</script>", "BOOT", new Date());
    expect(message).not.toContain("<script>");
    expect(message).toContain("&lt;script&gt;");
  });

  it("still renders the intended bold tag around the escaped name", () => {
    const message = formatEventMessage("My Laptop", "LOCK", new Date());
    expect(message).toContain("<b>My Laptop</b>");
  });
});
