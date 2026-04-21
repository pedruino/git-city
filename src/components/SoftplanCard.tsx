"use client";

import { useEffect, useState } from "react";

const ACCENT = "#76bc21";

type Tab = "ea" | "sponsor" | "creator";

interface SoftplanCardProps {
  onClose: () => void;
}

export default function SoftplanCard({ onClose }: SoftplanCardProps) {
  const [tab, setTab] = useState<Tab>("ea");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab bar */}
        <div
          className="flex gap-1 rounded-t-lg border border-b-0 px-2 pt-2"
          style={{ background: "#0f1217", borderColor: ACCENT }}
        >
          {(
            [
              ["ea", "EA"],
              ["sponsor", "Sponsor"],
              ["creator", "Creator"],
            ] as const
          ).map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors"
                style={{
                  color: active ? "#0f1217" : "#6a7080",
                  background: active ? ACCENT : "transparent",
                  fontFamily: "monospace",
                  borderRadius: "3px 3px 0 0",
                }}
              >
                {label}
              </button>
            );
          })}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto px-2 text-sm leading-none"
            style={{ color: "#888", background: "transparent" }}
          >
            ✕
          </button>
        </div>

        {/* Tab content container */}
        <div
          className="rounded-b-lg border shadow-2xl"
          style={{ background: "#0f1217", borderColor: ACCENT, color: "#e6e8ec" }}
        >
          {tab === "ea" && <EaStyle />}
          {tab === "sponsor" && <SponsorStyle />}
          {tab === "creator" && <CreatorStyle />}
        </div>
      </div>
    </div>
  );
}

// ─── EA (EArcade) style: large central hub with stat grid + CTAs ───
function EaStyle() {
  return (
    <div className="p-6" style={{ fontFamily: "monospace" }}>
      <div className="mb-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
        Landmark Hub
      </div>
      <h2 className="mb-1 text-3xl font-bold" style={{ color: "#fff" }}>
        softplan
      </h2>
      <p className="mb-5 text-sm" style={{ color: "#9aa0aa" }}>
        Sede no Sapiens Parque, Florianópolis — SC
      </p>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Stat label="Fundada" value="1990" />
        <Stat label="Devs" value="~1.3k" />
        <Stat label="Área" value="28k m²" />
      </div>

      <p className="mb-5 text-sm leading-relaxed" style={{ color: "#c6cad2" }}>
        Empresa brasileira de tecnologia. Desenvolve software para os setores
        de Justiça, Gov e Construção. O prédio foi projetado pela MOS
        Arquitetos em 2016.
      </p>

      <div className="flex gap-2">
        <a
          href="https://www.softplan.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 border-2 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider"
          style={{ borderColor: ACCENT, color: ACCENT, background: ACCENT + "11" }}
        >
          Visitar site
        </a>
        <a
          href="https://www.softplan.com.br/carreiras"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 border-2 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider"
          style={{ borderColor: "#444", color: "#ccc" }}
        >
          Ver vagas
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="border p-3 text-center"
      style={{ borderColor: "#222", background: "#181b22" }}
    >
      <div className="text-[9px] uppercase tracking-wider" style={{ color: "#6a7080" }}>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold" style={{ color: ACCENT }}>
        {value}
      </div>
    </div>
  );
}

// ─── Sponsor style: compact ad card with logo square, features bullets, CTA ───
function SponsorStyle() {
  return (
    <div className="p-4" style={{ fontFamily: "monospace" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2"
          style={{ borderColor: ACCENT, background: ACCENT + "11", color: ACCENT }}
        >
          <span className="text-lg font-bold">s</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: ACCENT }}>
            softplan
          </p>
          <p className="text-[10px]" style={{ color: "#9aa0aa" }}>
            Tecnologia que transforma setores
          </p>
        </div>
      </div>

      <div className="my-3 h-px" style={{ background: "#222" }} />

      {/* Description + features */}
      <p className="text-[11px] leading-relaxed" style={{ color: "#9aa0aa" }}>
        Empresa brasileira fundada em 1990. Sede no Sapiens Parque desde 2016,
        projeto da MOS Arquitetos com 28.000 m² voltados à inovação e
        sustentabilidade.
      </p>

      <div className="mt-3 space-y-1.5">
        {[
          "Software para Justiça, Gov e Construção",
          "~1.300 colaboradores em Floripa",
          "Brise externo Serge Ferrari",
          "Captação de água, LED, eficiência",
        ].map((feat) => (
          <div key={feat} className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full" style={{ background: ACCENT }} />
            <span className="text-[10px]" style={{ color: "#b0b6c0" }}>
              {feat}
            </span>
          </div>
        ))}
      </div>

      {/* Info badge */}
      <div className="mt-3 flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
        <span className="text-[9px]" style={{ color: ACCENT + "99" }}>
          Info landmark
        </span>
      </div>

      <div className="my-3 h-px" style={{ background: "#222" }} />

      {/* CTA */}
      <a
        href="https://www.softplan.com.br"
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full border-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider"
        style={{ borderColor: ACCENT, color: ACCENT, background: ACCENT + "11" }}
      >
        Visit softplan.com.br
      </a>
    </div>
  );
}

// ─── Creator style: narrative typewriter monologue ───
function CreatorStyle() {
  const paragraphs = [
    "Cada prédio dessa cidade é um commit. Cada janela acesa, um dev.",
    "Esse aqui é diferente. Não é um commit — é uma sede. 28 mil m² no Sapiens Parque, em Florianópolis. Projetada pela MOS Arquitetos, inaugurada em 2016. R$ 38 milhões investidos para que 1.300 pessoas construam software que move cartórios, obras e governos pelo país.",
    "Eu coloquei ela aqui porque, se você tá lendo isso, provavelmente é um desses devs. E se você olhar pela janela, talvez seu código esteja rodando em algum lugar que manda um sinal de volta até esse prédio.",
  ];
  const signature = "// softplan, no sapiens parque, norte da ilha";

  return (
    <div className="p-6 text-sm leading-relaxed" style={{ fontFamily: "monospace", color: "#c6cad2" }}>
      <div className="mb-3 text-[10px] uppercase tracking-[0.25em]" style={{ color: ACCENT }}>
        ▶ transmissão
      </div>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-3" style={{ color: "#d0d4dc" }}>
          {p}
        </p>
      ))}
      <div
        className="mt-4 border-t pt-3 text-xs"
        style={{ borderColor: "#222", color: ACCENT }}
      >
        {signature}
      </div>
    </div>
  );
}
