"use client";

import { useEffect, useRef, useState } from "react";
import type { PathSuggestion } from "./types";
import { fetchJson } from "./utils";

type PathBarProps = {
  value: string;
  onValueChange: (value: string) => void;
  onOpenPath: (path: string) => void;
  onBrowse: () => void;
  suggestionsEnabled: boolean;
  isPending: boolean;
  status: string;
};

export function PathBar({
  value,
  onValueChange,
  onOpenPath,
  onBrowse,
  suggestionsEnabled,
  isPending,
  status,
}: PathBarProps) {
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (!suggestionsEnabled || !value.trim()) {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
        return;
      }

      try {
        const result = await fetchJson<{ suggestions: PathSuggestion[] }>(
          `/api/fs/suggest?path=${encodeURIComponent(value)}&limit=5`,
        );

        if (!cancelled) {
          setSuggestions(result.suggestions);
          setShowSuggestions(isFocused && result.suggestions.length > 0);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [value, suggestionsEnabled, isFocused]);

  function applySuggestion(suggestion: PathSuggestion) {
    onValueChange(suggestion.completion);
    setSuggestions([]);
    setShowSuggestions(false);

    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const end = suggestion.completion.length;
      input.setSelectionRange(end, end);
    });
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onOpenPath(value);
      return;
    }

    if (event.key === "Tab" && suggestions.length > 0) {
      event.preventDefault();
      applySuggestion(suggestions[0]);
    }
  }

  return (
    <section className="hero-card compact-hero">
      <div className="hero-bar">
        <span className="hero-title">PDF Local Work</span>
        <div className="hero-input-group">
          <div className="path-input-stack">
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              onFocus={() => {
                setIsFocused(true);
                setShowSuggestions(suggestions.length > 0 && suggestionsEnabled);
              }}
              onBlur={() =>
                window.setTimeout(() => {
                  setIsFocused(false);
                  setShowSuggestions(false);
                }, 120)
              }
              onKeyDown={handleInputKeyDown}
              placeholder="C:\\Users\\you\\Documents\\PDFs"
              spellCheck={false}
            />
            {suggestionsEnabled && showSuggestions ? (
              <div className="path-suggestions" role="listbox" aria-label="Folder suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.path}
                    type="button"
                    className="path-suggestion"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <span className="path-suggestion-name">{suggestion.name}</span>
                    <span className="path-suggestion-path">{suggestion.path}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="primary-button" onClick={() => onOpenPath(value)} disabled={isPending}>
            Open
          </button>
          <button className="secondary-button" onClick={onBrowse} disabled={isPending}>
            Browse
          </button>
        </div>
      </div>
      <p className="status-line">{status}</p>
    </section>
  );
}
