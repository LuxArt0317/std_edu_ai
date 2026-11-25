import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AssistantChatMessage } from "../../src/features/public/AssistantChatMessage.tsx";
import chatbotStyles from "../../src/index.css?inline";
import messageStyles from "../../src/features/public/AssistantChatMessage.css?inline";

/** The actual chatbot renderer and stylesheet, isolated from lab dashboard CSS. */
export function LabChatMessage({ message }) {
  const host = useRef(null);
  const [root, setRoot] = useState(null);
  useLayoutEffect(() => {
    setRoot(host.current.shadowRoot || host.current.attachShadow({ mode: "open" }));
  }, []);
  return <div ref={host} className="lab-chat-message">{root && createPortal(<>
    <style>{chatbotStyles.replaceAll(":root", ":host")}</style>
    <style>{messageStyles}</style>
    <style>{`:host { display: block; min-width: 0; background: transparent; color: var(--foreground); font-family: Roboto, "Noto Sans TC", "Microsoft JhengHei", sans-serif; font-size: 16px; line-height: 1.5; } .lab-chat-surface { color: var(--foreground); }`}</style>
    <div className="lab-chat-surface"><AssistantChatMessage message={message} readOnly /></div>
  </>, root)}</div>;
}
