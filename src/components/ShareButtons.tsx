"use client";

import { useState, useRef, useEffect } from "react";
import { providerConfig } from "@/lib/auth-config";

interface Props {
  login: string;
  contributions: number;
  rank: number | null;
  accent: string;
  shadow: string;
}

type CardLang = "en" | "pt";

export default function ShareButtons({
  login,
  contributions,
  rank,
  accent,
  shadow,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [cardLang, setCardLang] = useState<CardLang>("en");
  const menuRef = useRef<HTMLDivElement>(null);

  // Avoid SSR/CSR hydration mismatch — start with the relative path both on
  // the server and the initial client render, then upgrade to the absolute URL
  // after hydration.
  const [profileUrl, setProfileUrl] = useState<string>(`/dev/${login}`);
  useEffect(() => {
    setProfileUrl(`${window.location.origin}/dev/${login}`);
  }, [login]);

  const tweetText = `My ${providerConfig.displayName} just turned into a building. ${contributions.toLocaleString()} contributions, Rank #${rank ?? "?"}. What does yours look like?`;

  const handleCopy = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (format: "landscape" | "stories") => {
    setShowFormatMenu(false);
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/share-card/${login}?format=${format}&lang=${cardLang}`
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gitcity-${login}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showFormatMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFormatMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFormatMenu]);

  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
      <a
        href={`https://teams.microsoft.com/l/chat/0/0?users=&message=${encodeURIComponent(`${tweetText} ${profileUrl}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-press px-5 py-2.5 text-[10px] text-bg"
        style={{
          backgroundColor: accent,
          boxShadow: `3px 3px 0 0 ${shadow}`,
        }}
      >
        Share on Teams
      </a>

      {/* Download Card */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowFormatMenu((v) => !v)}
          disabled={downloading}
          className="btn-press border-[3px] border-border px-5 py-2.5 text-[10px] text-cream transition-colors hover:border-border-light disabled:opacity-50"
        >
          {downloading ? "Downloading..." : "Download Card"}
        </button>

        {showFormatMenu && (
          <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 border-[3px] border-border bg-bg-raised p-2">
            {/* Language toggle */}
            <div className="mb-2 flex justify-center gap-1">
              <button
                onClick={() => setCardLang("en")}
                className="px-3 py-1 text-[10px] transition-colors"
                style={{
                  color: cardLang === "en" ? accent : muted,
                  borderBottom:
                    cardLang === "en" ? `2px solid ${accent}` : "2px solid transparent",
                }}
              >
                EN
              </button>
              <button
                onClick={() => setCardLang("pt")}
                className="px-3 py-1 text-[10px] transition-colors"
                style={{
                  color: cardLang === "pt" ? accent : muted,
                  borderBottom:
                    cardLang === "pt" ? `2px solid ${accent}` : "2px solid transparent",
                }}
              >
                PT
              </button>
            </div>
            <button
              onClick={() => handleDownload("landscape")}
              className="block w-full whitespace-nowrap px-4 py-2 text-left text-[10px] text-cream transition-colors hover:bg-bg-card"
            >
              Landscape (1200x675)
            </button>
            <button
              onClick={() => handleDownload("stories")}
              className="block w-full whitespace-nowrap px-4 py-2 text-left text-[10px] text-cream transition-colors hover:bg-bg-card"
            >
              Stories (1080x1920)
            </button>
          </div>
        )}
      </div>

      <button
        onClick={handleCopy}
        className="btn-press border-[3px] border-border px-5 py-2.5 text-[10px] text-cream transition-colors hover:border-border-light"
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}

const muted = "#8c8c9c";
