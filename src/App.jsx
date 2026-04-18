import { useState, useEffect, useRef } from "react";

const CARGOS = ["Médico Anestesista","Médico (outras especialidades)","CEO/Presidente","Diretor","Gerente","Coordenador","Analista","Estudante","Outros"];
const RESPONSAVEIS = ["Daniela da Silva","Diogenes Silva","Giorgio Pretto","Hector Passos","Lúcio Leite","Natália Dias","Valmor Junior"];
const PRODUTOS = ["AxReg","AxRocket","Analytics","Anestesia Cloud","Goldwing","Axel / IA","Assinatura Digital","Benchmarking","BI Inalatórios","BI Multiempresa","BI Acreditação","Integração com Monitor","Integração com Faturamento","Integração com PEP / HIS","Integração com imagens SADT","Outro"];
const EMPTY = {nome:"",telefone:"",email:"",empresa:"",cargo:"",abrirOportunidade:"",responsavel:"",produtos:[],observacoes:""};

const c = {
  bg:"#06101E", surf:"#0D1B30", surf2:"#122040", accent:"#2DD4BF",
  blue:"#3B82F6", text:"#EEF2FF", muted:"#6B84A3", danger:"#EF4444",
  success:"#10B981", warn:"#F59E0B", border:"#1E3354",
};

const injectCSS = () => {
  if (document.getElementById("copa-css")) return;
  const s = document.createElement("style");
  s.id = "copa-css";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:${c.bg};font-family:'DM Sans',sans-serif;}
    input,select,textarea{background:${c.surf};border:1px solid ${c.border};border-radius:10px;padding:11px 13px;color:${c.text};font-size:14px;font-family:'DM Sans',sans-serif;width:100%;outline:none;transition:border .2s;}
    input:focus,select:focus,textarea:focus{border-color:${c.accent};}
    select{appearance:none;}
    @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(45,212,191,.4)}50%{box-shadow:0 0 0 18px rgba(45,212,191,0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  `;
  document.head.appendChild(s);
};

// localStorage helpers
const storage = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// API call — goes through /api/claude (Vercel serverless, key stays server-side)
const callClaude = async (messages, opts = {}) => {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: opts.maxTokens || 800, messages }),
  });
  return res.json();
};

export default function App() {
  const [view, setView] = useState("capture");
  const [leads, setLeads] = useState([]);
  const [lead, setLead] = useState({ ...EMPTY });
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("");
  const [liveText, setLiveText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [delId, setDelId] = useState(null);

  const txRef = useRef(""); const recRef = useRef(null); const camRef = useRef(null);

  useEffect(() => {
    injectCSS();
    const saved = storage.get("copa26-leads");
    if (saved) setLeads(saved);
  }, []);

  const persist = (l) => storage.set("copa26-leads", l);

  // ── VOICE ────────────────────────────────────────────────────────────────
  const toggleListen = () => {
    if (listening) { recRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Reconhecimento de voz não suportado neste navegador. Use o Chrome."); return; }
    const r = new SR(); r.lang = "pt-BR"; r.continuous = true; r.interimResults = true; txRef.current = "";
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " "; txRef.current = t.trim(); setLiveText(t.trim()); };
    r.onend = () => { setListening(false); if (txRef.current) processVoice(txRef.current); };
    r.onerror = (e) => { setListening(false); if (e.error !== "aborted") setError("Erro no microfone: " + e.error); };
    recRef.current = r; r.start(); setListening(true); setLiveText(""); setError("");
  };

  const processVoice = async (text) => {
    setProcessingLabel("Processando áudio..."); setProcessing(true);
    try {
      const d = await callClaude([{ role: "user", content: `Extraia dados de lead do texto. Retorne SOMENTE JSON válido, sem markdown.\n\nCampos: nome, telefone (BR), email, empresa, cargo (um de: ${CARGOS.join(", ")}), abrirOportunidade ("Sim","Não" ou ""), responsavel (um de: ${RESPONSAVEIS.join(", ")} — inferir pelo primeiro nome; vazio se não mencionado), produtos (array com itens de: ${PRODUTOS.join(", ")}), observacoes (demais infos relevantes).\n\nTexto: "${text}"` }]);
      const raw = (d.content.find(x => x.type === "text")?.text || "{}").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw);
      setLead({ ...EMPTY, ...p, produtos: p.produtos || [] });
      setView("review");
    } catch { setError("Erro ao processar. Preencha manualmente."); setLead({ ...EMPTY }); setView("review"); }
    finally { setProcessing(false); }
  };

  // ── PHOTO ────────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setPhoto({ base64: reader.result.split(",")[1], mediaType: file.type, preview: reader.result }); setView("photo-preview"); };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const processPhoto = async () => {
    if (!photo) return;
    setProcessingLabel("Lendo cartão de visita..."); setProcessing(true);
    try {
      const d = await callClaude([{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: photo.mediaType, data: photo.base64 } },
        { type: "text", text: `Extraia os dados de contato deste cartão de visita. Retorne SOMENTE JSON válido, sem markdown. Campos: nome (nome completo), telefone (formato brasileiro se possível), email, empresa (nome da empresa), cargo (escolha o mais próximo de: ${CARGOS.join(", ")}). Use string vazia para campos não encontrados.` }
      ] }]);
      const raw = (d.content.find(x => x.type === "text")?.text || "{}").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw);
      setLead({ ...EMPTY, ...p, produtos: [] });
      setView("review");
    } catch { setError("Erro ao processar imagem. Preencha manualmente."); setLead({ ...EMPTY }); setView("review"); }
    finally { setProcessing(false); }
  };

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const saveLead = () => {
    const l = { ...lead, ts: new Date().toISOString(), id: Date.now() };
    const updated = [l, ...leads]; setLeads(updated); persist(updated);
    setSaved(true);
    setTimeout(() => { setSaved(false); setLead({ ...EMPTY }); setLiveText(""); setPhoto(null); setView("capture"); }, 1400);
  };

  const confirmDelete = (id) => { const u = leads.filter(l => l.id !== id); setLeads(u); persist(u); setDelId(null); };

  const exportCSV = () => {
    const h = ["Nome","Telefone","Email","Empresa","Cargo","Oportunidade","Responsável","Produtos","Observações","Data"];
    const rows = leads.map(l => [l.nome,l.telefone,l.email,l.empresa,l.cargo,l.abrirOportunidade,l.responsavel,(l.produtos||[]).join("; "),l.observacoes,new Date(l.ts).toLocaleString("pt-BR")]);
    const csv = [h, ...rows].map(r => r.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" })); a.download = `leads_copa_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  // ── HELPERS ──────────────────────────────────────────────────────────────
  const field = (label, children) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  const chip = (label, selected, onClick) => (
    <button key={label} onClick={onClick} style={{ padding: "6px 11px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", background: selected ? "rgba(45,212,191,.15)" : "rgba(18,32,64,.8)", border: `1px solid ${selected ? "rgba(45,212,191,.45)" : c.border}`, color: selected ? c.accent : c.muted, transition: "all .15s", fontFamily: "'DM Sans',sans-serif" }}>{label}</button>
  );

  const Header = () => (
    <div style={{ background: c.surf, borderBottom: `1px solid ${c.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c.accent} strokeWidth="1.5"/><path d="M12 7v5l3 3" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round"/></svg>
        <span style={{ fontSize: 16, fontWeight: 700, color: c.accent, letterSpacing: "-0.3px" }}>anestech</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#7DD3FC", background: "rgba(59,130,246,.12)", border: "1px solid rgba(59,130,246,.25)", padding: "3px 10px", borderRadius: 20 }}>COPA 2026</div>
    </div>
  );

  // ── PROCESSING ───────────────────────────────────────────────────────────
  if (processing) return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: c.text }}>
      <div style={{ width: 52, height: 52, border: `3px solid ${c.border}`, borderTop: `3px solid ${c.accent}`, borderRadius: "50%", animation: "spin 1s linear infinite" }}/>
      <div style={{ fontSize: 16, fontWeight: 500, color: c.accent }}>{processingLabel}</div>
      <div style={{ fontSize: 13, color: c.muted }}>IA extraindo informações</div>
    </div>
  );

  // ── PHOTO PREVIEW ────────────────────────────────────────────────────────
  if (view === "photo-preview") return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: c.bg, color: c.text, paddingBottom: 60 }}>
      <Header/>
      <div style={{ padding: "20px", maxWidth: 520, margin: "0 auto" }}>
        <button onClick={() => setView("capture")} style={{ background: "none", border: "none", color: c.accent, fontSize: 14, cursor: "pointer", padding: "0 0 18px", fontFamily: "'DM Sans',sans-serif" }}>← Voltar</button>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Cartão capturado</div>
        <div style={{ fontSize: 14, color: c.muted, marginBottom: 20 }}>Confirme a foto antes de processar</div>
        {photo?.preview && (
          <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${c.border}`, marginBottom: 20 }}>
            <img src={photo.preview} alt="Cartão de visita" style={{ width: "100%", display: "block", maxHeight: 340, objectFit: "contain", background: c.surf2 }}/>
          </div>
        )}
        <button onClick={processPhoto} style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${c.accent},${c.blue})`, color: "#050E1C", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>✦ Extrair dados com IA</button>
        <button onClick={() => camRef.current?.click()} style={{ width: "100%", padding: "13px", borderRadius: 12, border: `1px solid ${c.border}`, background: "transparent", color: c.muted, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Tirar outra foto</button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }}/>
      </div>
    </div>
  );

  // ── CAPTURE ──────────────────────────────────────────────────────────────
  if (view === "capture") return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: c.bg, color: c.text, paddingBottom: 60 }}>
      <Header/>
      <div style={{ padding: "28px 20px", maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Captura de lead</div>
        <div style={{ fontSize: 14, color: c.muted, marginBottom: 28 }}>Voz, foto do cartão ou manual</div>

        {error && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#FCA5A5", marginBottom: 16, display: "flex", justifyContent: "space-between" }}>{error}<span style={{ cursor: "pointer" }} onClick={() => setError("")}>✕</span></div>}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={toggleListen} style={{ width: 110, height: 110, borderRadius: "50%", cursor: "pointer", outline: "none", background: listening ? `linear-gradient(135deg,${c.accent},${c.blue})` : c.surf2, border: `3px solid ${listening ? c.accent : c.border}`, animation: listening ? "pulse 1.5s infinite" : "none", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .25s" }}>
            {listening
              ? <svg width="38" height="38" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="#fff" stroke="none"/></svg>
              : <svg width="38" height="38" fill="none" stroke={c.accent} strokeWidth="2" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            }
          </button>
          <div style={{ fontSize: 12, fontWeight: 600, color: listening ? c.accent : c.muted, letterSpacing: .5, animation: listening ? "blink 1.5s infinite" : "none" }}>
            {listening ? "● OUVINDO — toque para parar" : "TOQUE PARA FALAR"}
          </div>
        </div>

        {liveText && (
          <div style={{ background: "rgba(13,27,48,.9)", border: `1px solid rgba(45,212,191,.2)`, borderRadius: 12, padding: "12px 15px", marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: c.muted, letterSpacing: .8, marginBottom: 6 }}>TRANSCREVENDO</div>
            <div style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.65 }}>{liveText}</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 16px" }}>
          <div style={{ flex: 1, height: "1px", background: c.border }}/><span style={{ fontSize: 11, color: c.muted, fontWeight: 500 }}>OU</span><div style={{ flex: 1, height: "1px", background: c.border }}/>
        </div>

        <button onClick={() => camRef.current?.click()} style={{ width: "100%", padding: "15px", borderRadius: 14, border: `1px solid rgba(251,191,36,.3)`, background: "rgba(251,191,36,.06)", color: "#FCD34D", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <svg width="20" height="20" fill="none" stroke="#FCD34D" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Fotografar cartão de visita
        </button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }}/>

        <button onClick={() => { setLead({ ...EMPTY }); setView("review"); }} style={{ width: "100%", padding: "13px", borderRadius: 12, border: `1px solid ${c.border}`, background: "transparent", color: c.muted, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginBottom: 20 }}>
          Preencher manualmente
        </button>

        {leads.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setView("list")} style={{ flex: 1, padding: "13px", borderRadius: 12, border: `1px solid rgba(45,212,191,.25)`, background: "rgba(45,212,191,.05)", color: c.accent, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              Leads <span style={{ background: "rgba(45,212,191,.15)", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 700, marginLeft: 6 }}>{leads.length}</span>
            </button>
            <button onClick={() => setView("dashboard")} style={{ flex: 1, padding: "13px", borderRadius: 12, border: `1px solid rgba(59,130,246,.25)`, background: "rgba(59,130,246,.05)", color: c.blue, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              Dashboard
            </button>
          </div>
        )}

        <div style={{ marginTop: 24, padding: "14px 16px", background: c.surf, borderRadius: 12, border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, letterSpacing: .8, marginBottom: 8 }}>DICA</div>
          <div style={{ fontSize: 13, color: "#8BA0BC", lineHeight: 1.6 }}>Fale: <span style={{ color: c.text, fontStyle: "italic" }}>"João Silva, anestesista da Santa Casa, 11 99999-8888, interessado em AxReg, responsável Hector, abrir oportunidade."</span></div>
        </div>
      </div>
    </div>
  );

  // ── REVIEW ───────────────────────────────────────────────────────────────
  if (view === "review") {
    const toggle = (p) => { const ps = lead.produtos || []; setLead(prev => ({ ...prev, produtos: ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p] })); };
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: c.bg, color: c.text, paddingBottom: 60 }}>
        <Header/>
        <div style={{ padding: "20px 20px 60px", maxWidth: 520, margin: "0 auto" }}>
          <button onClick={() => setView("capture")} style={{ background: "none", border: "none", color: c.accent, fontSize: 14, cursor: "pointer", padding: "0 0 18px", fontFamily: "'DM Sans',sans-serif" }}>← Voltar</button>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Revisar lead</div>
          <div style={{ fontSize: 14, color: c.muted, marginBottom: 24 }}>Confirme ou corrija antes de salvar</div>

          {saved && <div style={{ background: "rgba(45,212,191,.1)", border: "1px solid rgba(45,212,191,.3)", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: c.accent, marginBottom: 16, animation: "fadeIn .2s", textAlign: "center", fontWeight: 500 }}>✓ Lead salvo com sucesso</div>}

          {photo?.preview && (
            <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${c.border}`, marginBottom: 16, maxHeight: 140 }}>
              <img src={photo.preview} alt="Cartão" style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 140 }}/>
            </div>
          )}

          {field("Nome", <input value={lead.nome} onChange={e => setLead(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo"/>)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Telefone</div><input value={lead.telefone} onChange={e => setLead(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999"/></div>
            <div><div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Empresa</div><input value={lead.empresa} onChange={e => setLead(p => ({ ...p, empresa: e.target.value }))} placeholder="Hospital / Grupo"/></div>
          </div>
          {field("E-mail", <input type="email" value={lead.email} onChange={e => setLead(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com"/>)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Cargo</div>
              <select value={lead.cargo} onChange={e => setLead(p => ({ ...p, cargo: e.target.value }))}><option value="">Selecionar...</option>{CARGOS.map(x => <option key={x} value={x}>{x}</option>)}</select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Responsável</div>
              <select value={lead.responsavel} onChange={e => setLead(p => ({ ...p, responsavel: e.target.value }))}><option value="">Selecionar...</option>{RESPONSAVEIS.map(x => <option key={x} value={x}>{x.split(" ")[0]}</option>)}</select>
            </div>
          </div>
          {field("Abrir oportunidade?",
            <div style={{ display: "flex", gap: 10 }}>
              {["Sim","Não"].map(v => (
                <button key={v} onClick={() => setLead(p => ({ ...p, abrirOportunidade: v }))} style={{ flex: 1, padding: "11px", borderRadius: 10, cursor: "pointer", background: lead.abrirOportunidade === v ? "rgba(45,212,191,.15)" : c.surf, border: `1px solid ${lead.abrirOportunidade === v ? "rgba(45,212,191,.45)" : c.border}`, color: lead.abrirOportunidade === v ? c.accent : c.muted, fontSize: 14, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", transition: "all .15s" }}>{v}</button>
              ))}
            </div>
          )}
          {field("Produtos de interesse",
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{PRODUTOS.map(p => chip(p, (lead.produtos || []).includes(p), () => toggle(p)))}</div>
          )}
          {field("Observações", <textarea rows={3} value={lead.observacoes} onChange={e => setLead(p => ({ ...p, observacoes: e.target.value }))} placeholder="Notas adicionais..." style={{ resize: "vertical", lineHeight: 1.5 }}/>)}
          <div style={{ height: 16 }}/>
          <button onClick={saveLead} style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${c.accent},${c.blue})`, color: "#050E1C", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", letterSpacing: .3, marginBottom: 10 }}>✓ Salvar lead</button>
          <button onClick={() => { setLead({ ...EMPTY }); setPhoto(null); setView("capture"); }} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "transparent", color: c.muted, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ── LIST ─────────────────────────────────────────────────────────────────
  if (view === "list") return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: c.bg, color: c.text, paddingBottom: 60 }}>
      <Header/>
      <div style={{ padding: "20px", maxWidth: 520, margin: "0 auto" }}>
        <button onClick={() => setView("capture")} style={{ background: "none", border: "none", color: c.accent, fontSize: 14, cursor: "pointer", padding: "0 0 18px", fontFamily: "'DM Sans',sans-serif" }}>← Voltar</button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Leads <span style={{ background: "rgba(45,212,191,.12)", color: c.accent, fontSize: 13, fontWeight: 700, borderRadius: 20, padding: "2px 10px", marginLeft: 6 }}>{leads.length}</span></div>
          <div style={{ display: "flex", gap: 8 }}>
            {leads.length > 0 && <button onClick={exportCSV} style={{ background: "rgba(45,212,191,.1)", border: "1px solid rgba(45,212,191,.3)", borderRadius: 8, padding: "7px 12px", color: c.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>↓ CSV</button>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: c.muted }}>Capturados no evento</div>
          <button onClick={() => setView("dashboard")} style={{ background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.3)", borderRadius: 8, padding: "7px 12px", color: c.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Dashboard</button>
        </div>
        {leads.length === 0 && <div style={{ textAlign: "center", color: c.muted, padding: "48px 0", fontSize: 14 }}>Nenhum lead capturado ainda.</div>}
        {leads.map(l => (
          <div key={l.id} style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12, animation: "fadeIn .2s" }}>
            {delId === l.id ? (
              <div>
                <div style={{ fontSize: 14, marginBottom: 12, color: "#FCA5A5" }}>Remover este lead?</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => confirmDelete(l.id)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.1)", color: "#EF4444", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Sim, remover</button>
                  <button onClick={() => setDelId(null)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.muted, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div><div style={{ fontSize: 15, fontWeight: 600 }}>{l.nome || "—"}</div><div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{[l.cargo, l.empresa].filter(Boolean).join(" · ")}</div></div>
                  <button onClick={() => setDelId(l.id)} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 16, padding: "0 0 0 8px" }}>✕</button>
                </div>
                {l.telefone && <div style={{ fontSize: 12, color: c.muted, marginBottom: 3 }}>📞 {l.telefone}</div>}
                {l.email && <div style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>✉ {l.email}</div>}
                {l.produtos?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {l.produtos.slice(0,4).map(p => <span key={p} style={{ fontSize: 11, background: "rgba(45,212,191,.1)", color: c.accent, borderRadius: 20, padding: "2px 9px" }}>{p}</span>)}
                    {l.produtos.length > 4 && <span style={{ fontSize: 11, color: c.muted }}>+{l.produtos.length - 4}</span>}
                  </div>
                )}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${c.border}`, display: "flex", gap: 14, fontSize: 11, color: c.muted }}>
                  {l.responsavel && <span>👤 {l.responsavel.split(" ")[0]}</span>}
                  <span style={{ color: l.abrirOportunidade === "Sim" ? c.success : l.abrirOportunidade === "Não" ? c.danger : c.muted }}>
                    {l.abrirOportunidade === "Sim" ? "● Oportunidade" : l.abrirOportunidade === "Não" ? "● Sem oportunidade" : "○ Oportunidade?"}
                  </span>
                  <span style={{ marginLeft: "auto" }}>{new Date(l.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ── DASHBOARD ────────────────────────────────────────────────────────────
  if (view === "dashboard") {
    const total = leads.length;
    const opSim = leads.filter(l => l.abrirOportunidade === "Sim").length;
    const opNao = leads.filter(l => l.abrirOportunidade === "Não").length;
    const opPend = total - opSim - opNao;
    const prodCount = leads.reduce((acc, l) => { (l.produtos || []).forEach(p => { acc[p] = (acc[p] || 0) + 1; }); return acc; }, {});
    const byResp = leads.reduce((acc, l) => { const v = l.responsavel || "Não atribuído"; acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const byCargo = leads.reduce((acc, l) => { const v = l.cargo || "Não informado"; acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const topProd = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topCargo = Object.entries(byCargo).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topResp = Object.entries(byResp).sort((a, b) => b[1] - a[1]);
    const hourBuckets = Array.from({ length: 24 }, (_, i) => ({ h: i, n: 0 }));
    leads.forEach(l => { const h = new Date(l.ts).getHours(); hourBuckets[h].n++; });
    const activeHours = hourBuckets.filter(h => h.n > 0);
    const maxHour = Math.max(...hourBuckets.map(h => h.n), 1);
    const maxResp = Math.max(...Object.values(byResp), 1);
    const maxProd = topProd.length ? topProd[0][1] : 1;
    const maxCargo = topCargo.length ? topCargo[0][1] : 1;
    const pct = (n, max) => Math.round((n / max) * 100);

    const HBar = ({ label, value, max, color = c.accent, total: t }) => (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: c.text, fontWeight: 500, maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ fontSize: 11, color: c.muted, flexShrink: 0 }}>{value}{t ? ` (${Math.round(value / t * 100)}%)` : ""}</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct(value, max)}%`, background: color, borderRadius: 4, transition: "width .6s ease" }}/>
        </div>
      </div>
    );

    const Card = ({ label, value, sub, color = c.accent }) => (
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 14, padding: "16px 14px", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: c.muted }}>{sub}</div>}
      </div>
    );

    const Section = ({ title, children }) => (
      <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 14, padding: "16px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    );

    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: c.bg, color: c.text, paddingBottom: 60 }}>
        <Header/>
        <div style={{ padding: "20px", maxWidth: 520, margin: "0 auto" }}>
          <button onClick={() => setView("capture")} style={{ background: "none", border: "none", color: c.accent, fontSize: 14, cursor: "pointer", padding: "0 0 14px", fontFamily: "'DM Sans',sans-serif" }}>← Voltar</button>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</div>
            <div style={{ fontSize: 11, color: c.muted }}>COPA 2026 · ao vivo</div>
          </div>

          {total === 0 && <div style={{ textAlign: "center", color: c.muted, padding: "60px 0", fontSize: 14 }}>Nenhum lead ainda — capture o primeiro!</div>}

          {total > 0 && <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Card label="Total leads" value={total} sub="capturados"/>
              <Card label="Oportunidades" value={opSim} sub={`${Math.round(opSim / total * 100)}% do total`} color={c.success}/>
              <Card label="Sem op." value={opNao} sub={opPend > 0 ? `${opPend} pendentes` : ""} color={c.danger}/>
            </div>

            <Section title="Oportunidades">
              <div style={{ display: "flex", height: 12, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                {opSim > 0 && <div style={{ flex: opSim, background: c.success }}/>}
                {opNao > 0 && <div style={{ flex: opNao, background: c.danger }}/>}
                {opPend > 0 && <div style={{ flex: opPend, background: c.border }}/>}
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                <span style={{ color: c.success }}>● Sim — {opSim}</span>
                <span style={{ color: c.danger }}>● Não — {opNao}</span>
                {opPend > 0 && <span style={{ color: c.muted }}>● Pendente — {opPend}</span>}
              </div>
            </Section>

            <Section title="Leads por responsável">
              {topResp.map(([name, n]) => <HBar key={name} label={name} value={n} max={maxResp} total={total} color={c.blue}/>)}
            </Section>

            {topProd.length > 0 && (
              <Section title="Produtos mais citados">
                {topProd.map(([prod, n]) => <HBar key={prod} label={prod} value={n} max={maxProd} total={total} color={c.accent}/>)}
              </Section>
            )}

            {topCargo.length > 0 && (
              <Section title="Perfil dos contatos">
                {topCargo.map(([cargo, n]) => <HBar key={cargo} label={cargo} value={n} max={maxCargo} total={total} color="#A78BFA"/>)}
              </Section>
            )}

            {activeHours.length > 0 && (
              <Section title="Capturas por hora">
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, marginBottom: 8 }}>
                  {activeHours.map(({ h, n }) => (
                    <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ width: "100%", background: c.accent, borderRadius: "3px 3px 0 0", height: `${Math.round((n / maxHour) * 52)}px`, minHeight: 4 }}/>
                      <span style={{ fontSize: 9, color: c.muted }}>{String(h).padStart(2,"0")}h</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: c.muted, textAlign: "right" }}>pico: {activeHours.sort((a, b) => b.n - a.n)[0]?.n || 0} lead(s)/hora</div>
              </Section>
            )}

            {topResp.length > 1 && (
              <div style={{ background: c.surf, border: `1px solid ${c.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: c.muted, textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 }}>MVP do evento</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{topResp[0][0]}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: c.accent }}>{topResp[0][1]}</div>
                  <div style={{ fontSize: 11, color: c.muted }}>leads</div>
                </div>
              </div>
            )}
          </>}
        </div>
      </div>
    );
  }

  return null;
}
