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
      <div className="ai-chat-header">
        <div>
          <h3 className="ai-chat-title">AI config assistant</h3>
          <p className="ai-chat-helper-text">
            Describe the chart you need and the assistant will rewrite the
            poster config and bindings to match your dataset.
          </p>
        </div>
        <span
          className={`ai-chat-status ${hasCatalog ? "ai-chat-status--ready" : "ai-chat-status--loading"}`}
        >
          {hasCatalog ? "Catalog ready" : "Loading catalog"}
        </span>
      </div>

      <div className="ai-chat-messages">
        {messages.length === 0 ? (
          <div className="ai-chat-empty">
            <p className="ai-chat-empty-title">Jumpstart a request</p>
            <ul className="ai-chat-empty-list">
              <li>
                Turn this into a dual chart of swap volume vs. TVL grouped by
                chain from <code>plasma.fact_swaps</code>
              </li>
              <li>
                Switch to a bar chart of daily swap count by token symbol with
                a 30 day window
              </li>
              <li>
                Make a pie showing volume share by pool and highlight the top 5
                pools
              </li>
            </ul>
          </div>
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
        rows={3}
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
