// app/hooks/useWebSocket.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Status = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions<TMessage> {
  /** URL of the WebSocket endpoint */
  url: string;
  /** Optional function to parse incoming raw messages */
  parseMessage?: (event: MessageEvent) => TMessage;
  /** Optional function to handle parsed messages */
  onMessage?: (msg: TMessage) => void;
  /** Maximum number of reconnection attempts before giving up */
  maxAttempts?: number;
}

export function useWebSocket<TMessage = unknown>(options: UseWebSocketOptions<TMessage>) {
  const { url, parseMessage, onMessage, maxAttempts = 5 } = options;
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const backoffRef = useRef<NodeJS.Timeout | null>(null);

  const send = useCallback((data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const connect = useCallback(() => {
    setStatus("connecting");
    setError(null);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      attemptRef.current = 0; // reset attempts on success
    };

    ws.onmessage = (ev) => {
      const msg = parseMessage ? parseMessage(ev) : (ev as unknown as TMessage);
      if (onMessage) onMessage(msg);
    };

    ws.onerror = (ev) => {
      console.error("WebSocket error", ev);
      setError("WebSocket error");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      if (attemptRef.current < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attemptRef.current, 30000);
        attemptRef.current += 1;
        backoffRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setStatus("error");
        setError("Unable to reconnect after several attempts");
      }
    };
  }, [url, parseMessage, onMessage, maxAttempts]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (backoffRef.current) clearTimeout(backoffRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { status, error, send };
}
