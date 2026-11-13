// CLIENT ONLY. Clipboard helpers with a fallback for browsers without the async clipboard API.

export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Reads text from the clipboard, or returns null when the browser does not allow it. */
export async function readClipboardText(): Promise<string | null> {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
