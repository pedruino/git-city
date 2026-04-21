"use client";

import { useEffect } from "react";

const ACCENT = "#76bc21";

interface SoftplanCardProps {
  onClose: () => void;
}

export default function SoftplanCard({ onClose }: SoftplanCardProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto fixed z-40
        bottom-0 left-0 right-0
        sm:bottom-auto sm:left-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2
        w-full sm:w-[420px]
        animate-[slide-up_0.2s_ease-out] sm:animate-none"
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center py-2 sm:hidden" style={{ background: "#0f1217" }}>
        <div className="h-1 w-10 rounded-full" style={{ background: "#333" }} />
      </div>

      {/* Close bar */}
      <div
        className="flex border border-b-0 px-3 pt-2 pb-1 sm:rounded-t-lg"
        style={{ background: "#0f1217", borderColor: ACCENT }}
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="ml-auto px-1 text-sm leading-none"
          style={{ color: "#888", background: "transparent" }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div
        className="border shadow-2xl sm:rounded-b-lg max-h-[60vh] sm:max-h-[75vh] overflow-y-auto"
        style={{ background: "#0f1217", borderColor: ACCENT, color: "#e6e8ec" }}
      >
        <EaStyle />
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

