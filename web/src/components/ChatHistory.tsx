import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useScoutSession } from "../ScoutSession";

/** Sprout's chat history (moved here from the old wide sidebar): "Recent chats" opens a list to reopen or delete a chat,
 *  and "New chat" starts a fresh one. The Shell keys ScoutPage by the active chat, so opening or starting a chat remounts
 *  the page and closes this list. Escape closes it and returns focus to its button. */
export function ChatHistory() {
  const { t } = useI18n();
  const { chats, activeId, newChat, openChat, deleteChat } = useScoutSession();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="sc-history">
      <button ref={toggle} type="button" className="sc-history-btn" aria-expanded={open} aria-controls="sc-history-panel" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 3" /></svg>
        <span className="sc-label">{t("Recent chats")}</span>
        {chats.length > 0 && <>{" "}<span className="sc-count">{chats.length}</span></>}
      </button>
      <button type="button" className="sc-new" onClick={newChat}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <span className="sc-label">{t("New chat")}</span>
      </button>
      {open && (
        <section id="sc-history-panel" className="sc-history-panel" aria-label={t("Recent chats")}>
          {chats.length === 0 ? (
            <p className="sc-history-empty">{t("No chats yet. Ask Sprout anything about a field.")}</p>
          ) : (
            <ul className="sc-chats">
              {chats.map((c) => (
                <li key={c.id} className={c.id === activeId ? "on" : ""}>
                  <button type="button" className="sc-chat" title={c.title} aria-current={c.id === activeId ? "true" : undefined} onClick={() => openChat(c.id)}>
                    {c.title}
                  </button>
                  <button type="button" className="sc-del" aria-label={t("Delete chat {title}", { title: c.title })} onClick={() => deleteChat(c.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
