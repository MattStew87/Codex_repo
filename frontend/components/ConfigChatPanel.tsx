// app/components/ConfigChatPanel.tsx
"use client";

import { useState } from "react";
import type {
  PosterType,
  PosterConfig,
  BindingState,
  ChatMessage,
  CatalogSchemaSnapshot,
  AiConfigResponsePayload,
} from "@/lib/types";

interface Props {
  posterType: PosterType;
  config: PosterConfig | null;
  binding: BindingState | null;
  catalog: CatalogSchemaSnapshot | null | CatalogSchemaSnapshot[] | undefined;
  onApplyAiUpdate: (payload: {
    posterType: PosterType;
    config: PosterConfig;
    binding: BindingState | null;
    assistantMessage: string;
  }) => void;
}

export function ConfigChatPanel({
  posterType,
  config,
  binding,
  catalog,
  onApplyAiUpdate,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCatalog =
    Array.isArray(catalog) && catalog.length > 0 && !!catalog[0].db;

  const disabled = !config || !hasCatalog || loading;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !config || !hasCatalog) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          posterType,
          config,
          binding,
          catalog,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "AI config request failed");
      }

      const data = (await res.json()) as AiConfigResponsePayload;

      onApplyAiUpdate({
        posterType: data.posterType,
        config: data.config,
        binding: data.binding,
        assistantMessage: data.assistant_message,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.assistant_message },
      ]);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-chat-panel">
      <h3 className="ai-chat-title">AI config assistant</h3>

      {!hasCatalog && (
        <p className="ai-chat-helper-text">
          Loading catalog snapshot… the assistant will be enabled once ready.
        </p>
      )}

      <div className="ai-chat-messages">
        {messages.length === 0 ? (
          <p className="ai-chat-empty">
            Ask things like:
            <br />
            <code>
              Make this a dual chart of total volume by chain over time using
              plasma.fact_swaps
            </code>
            <br />
            or
            <br />
            <code>Turn this into a pie of volume share by token</code>
          </p>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              className={
                "ai-chat-message " +
                (m.role === "user"
                  ? "ai-chat-message--user"
                  : "ai-chat-message--assistant")
              }
            >
              <span
                className={
                  "ai-chat-bubble " +
                  (m.role === "user"
                    ? "ai-chat-bubble--user"
                    : "ai-chat-bubble--assistant")
                }
              >
                {m.content}
              </span>
            </div>
          ))
        )}
      </div>

      <textarea
        className="ai-chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Describe what you want the chart to show…"
        rows={2}
      />

      {error && <p className="ai-chat-error">{error}</p>}

      <div className="ai-chat-footer">
        <button type="button" onClick={handleSend} disabled={disabled}>
          {loading ? "Thinking…" : "Ask AI"}
        </button>
      </div>
    </div>
  );
}
