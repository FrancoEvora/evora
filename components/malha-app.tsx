"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Bell, Building2, Check, ChevronDown, ChevronRight, CircleDollarSign,
  Clock3, Database, FileCheck2, FileClock, FileText, FolderLock, Layers3,
  LayoutDashboard, MapPinned, Menu, PanelLeftClose, Plus, Search, Send, ShieldCheck,
  Sparkles, Target, TrendingUp, Upload, Users, X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Toaster, toast } from "sonner";
import MalhaMap from "@/components/malha-map";
import TerritorialIntelligence from "@/components/territorial-intelligence";
import { dealDocuments, initialPipeline, investorMatches, opportunities, type Opportunity } from "@/lib/malha-data";

type Workspace = "overview" | "territorial" | "opportunities" | "matches" | "dealroom" | "pipeline";

const nav: { id: Workspace; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
  { id: "territorial", label: "Inteligência Territorial", icon: Layers3 },
  { id: "opportunities", label: "Oportunidades", icon: Target },
  { id: "matches", label: "Matches", icon: Users },
  { id: "dealroom", label: "Deal Room", icon: FolderLock },
  { id: "pipeline", label: "Pipeline", icon: TrendingUp },
];

const pageTitles: Record<Workspace, string> = {
  overview: "Inteligência Territorial",
  territorial: "Análise Territorial",
  opportunities: "Oportunidades",
  matches: "Matches de Capital",
  dealroom: "Deal Room",
  pipeline: "Pipeline",
};

const money = (value: number) => `R$ ${value.toLocaleString("pt-BR")} mi`;

function MiniMap({ opportunity }: { opportunity: Opportunity }) {
  const points = opportunity.polygon.map((_, index) => {
    const fallback = [[18,54],[35,26],[78,17],[91,49],[65,79],[25,76]];
    return fallback[index % fallback.length].join(",");
  }).join(" ");
  return (
    <svg viewBox="0 0 110 92" aria-hidden="true" className="malha-mini-map">
      <rect width="110" height="92" fill="#26332e" />
      <path d="M-8 72L118 14M-7 25L114 78M54-10L49 103" stroke="#d8ceb822" strokeWidth="5" />
      <path d="M-8 72L118 14M-7 25L114 78M54-10L49 103" stroke="#d8ceb844" strokeWidth="1" />
      <polygon points={points} fill="#d3925155" stroke="#e8a867" strokeWidth="2" />
      <circle cx="58" cy="47" r="4" fill="#ffe0b9" />
    </svg>
  );
}

function StatusDot({ tone }: { tone: "green" | "amber" | "red" }) {
  return <span className={`malha-status-dot ${tone}`} />;
}

function FitBadge({ value }: { value: number }) {
  return <span className="malha-fit-badge">Fit <b>{value}</b></span>;
}

function OpportunityCard({ opportunity, active, onClick, compact = false }: { opportunity: Opportunity; active?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <article className={`malha-opportunity-card${active ? " active" : ""}${compact ? " compact" : ""}`}>
      <button className="malha-card-select" onClick={onClick} aria-label={`Analisar ${opportunity.name}`} />
      <MiniMap opportunity={opportunity} />
      <div className="malha-opportunity-body">
        <p>{opportunity.kind}</p>
        <div className="malha-opportunity-scores"><FitBadge value={opportunity.fit} /><span>Prontidão <b>{opportunity.readiness}</b></span></div>
        <span className="malha-opportunity-region"><MapPinned /> {opportunity.region}</span>
        <div className="malha-opportunity-values"><strong>{opportunity.areaHa.toLocaleString("pt-BR")} ha</strong><i /><strong>VGV {money(opportunity.vgv)}</strong></div>
        {!compact && <button className="malha-outline-button" onClick={onClick}>Analisar</button>}
      </div>
    </article>
  );
}

function SelectedAreaPanel({ opportunity, onClose }: { opportunity: Opportunity; onClose: () => void }) {
  const trend = opportunity.trend.map((value, index) => ({ year: 2024 + index, value }));
  return (
    <section className="malha-selected-panel">
      <button className="malha-close" onClick={onClose} aria-label="Fechar painel"><X /></button>
      <span className="malha-panel-kicker">Área selecionada</span>
      <h2><MapPinned /> {opportunity.name}</h2>
      <p>{opportunity.city}, MG</p>
      <div className="malha-selected-values">
        <div><b>{opportunity.areaHa.toLocaleString("pt-BR")} ha</b><span>Área total</span></div>
        <div><b>{money(opportunity.vgv)}</b><span>VGV potencial</span></div>
      </div>
      <div className="malha-panel-chart">
        <span>VGV potencial (R$ mi)</span>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 150 }}>
          <AreaChart data={trend} margin={{ top: 12, right: 5, left: -24, bottom: 0 }}>
            <defs><linearGradient id="malhaTrend" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d39251" stopOpacity=".32"/><stop offset="1" stopColor="#d39251" stopOpacity="0"/></linearGradient></defs>
            <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "#838b86", fontSize: 9 }} minTickGap={18}/>
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#838b86", fontSize: 9 }}/>
            <Tooltip contentStyle={{ background: "#101614", border: "1px solid #38413d", color: "#fff", fontSize: 11 }} formatter={(value) => [`R$ ${value} mi`, "VGV"]}/>
            <Area type="monotone" dataKey="value" stroke="#d39251" strokeWidth={2} fill="url(#malhaTrend)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="malha-gates">
        <div><StatusDot tone="green"/><b>Mercado</b><span>Favorável</span></div>
        <div><StatusDot tone="amber"/><b>Urbanismo</b><span>Em análise</span></div>
        <div><StatusDot tone="green"/><b>Capital</b><span>Favorável</span></div>
      </div>
    </section>
  );
}

function PipelineStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="malha-pipeline-strip">
      <div className="malha-pipeline-heading"><h2>Pipeline</h2><button onClick={onOpen}>Ver completo <ChevronRight /></button></div>
      <div className="malha-pipeline-content">
        <div className="malha-stage-list">
          {initialPipeline.map((stage, index) => <button key={stage.key} className={stage.active ? "active" : ""} onClick={onOpen}><span>{stage.label}</span><b>{stage.count}</b><small>{money(stage.value)}</small>{index < initialPipeline.length - 1 && <ChevronRight className="malha-stage-arrow"/>}</button>)}
        </div>
        <div className="malha-bottom-kpis">
          <div><CircleDollarSign/><span>VGV potencial</span><b>R$ 1,4 bi</b><i className="sparkline copper" /></div>
          <div><Building2/><span>Capital em análise</span><b>R$ 128 mi</b><i className="sparkline green" /></div>
          <div><Target/><span>Oportunidades</span><b>8</b><i className="bar-spark"><em/><em/><em/><em/><em/><em/></i></div>
        </div>
      </div>
    </section>
  );
}

function Overview({ selected, setSelected, query, go }: { selected: Opportunity | null; setSelected: (item: Opportunity | null) => void; query: string; go: (workspace: Workspace) => void }) {
  const visible = opportunities.filter((item) => `${item.name} ${item.city} ${item.kind}`.toLowerCase().includes(query.toLowerCase()));
  const active = selected ?? visible[0] ?? opportunities[0];
  return (
    <div className="malha-overview-grid">
      <section className="malha-map-section">
        <MalhaMap opportunities={visible.length ? visible : opportunities} selectedId={active.id} onSelect={(id) => setSelected(opportunities.find((item) => item.id === id) ?? null)} />
        {selected && <SelectedAreaPanel opportunity={selected} onClose={() => setSelected(null)} />}
      </section>
      <aside className="malha-opportunity-rail">
        <div className="malha-rail-head"><h2>{visible.length} oportunidades</h2><button onClick={() => go("opportunities")} aria-label="Abrir oportunidades"><ChevronRight /></button></div>
        <div className="malha-rail-list">{visible.map((item) => <OpportunityCard key={item.id} opportunity={item} active={item.id === active.id} onClick={() => setSelected(item)} />)}</div>
      </aside>
      <PipelineStrip onOpen={() => go("pipeline")} />
    </div>
  );
}

function OpportunityWorkspace({ query, select, openCreate }: { query: string; select: (item: Opportunity) => void; openCreate: () => void }) {
  const [stage, setStage] = useState("Todos");
  const visible = opportunities.filter((item) => (stage === "Todos" || item.stage === stage) && `${item.name} ${item.city} ${item.kind}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="malha-workspace-page">
      <div className="malha-page-intro"><div><span>Originação qualificada</span><h1>Oportunidades</h1><p>Terrenos e empreendimentos padronizados por maturidade, risco e estrutura.</p></div><button className="malha-primary" onClick={openCreate}><Plus /> Nova oportunidade</button></div>
      <div className="malha-filter-row">
        {["Todos","Mapeada","Em análise","Em estruturação","Em negociação"].map((item) => <button key={item} className={stage === item ? "active" : ""} onClick={() => setStage(item)}>{item}</button>)}
      </div>
      <div className="malha-opportunity-grid">{visible.map((item) => <OpportunityCard key={item.id} opportunity={item} onClick={() => select(item)} compact />)}</div>
      {!visible.length && <div className="malha-empty"><Search/><b>Nenhuma oportunidade encontrada</b><span>Altere os filtros ou cadastre uma nova área.</span></div>}
    </div>
  );
}

function MatchesWorkspace({ selected }: { selected: Opportunity }) {
  const [connected, setConnected] = useState<string[]>([]);
  return (
    <div className="malha-workspace-page">
      <div className="malha-page-intro"><div><span>Match por mandato e precedente</span><h1>Capital aderente</h1><p>{selected.name} · {money(selected.capital)} procurados</p></div><div className="malha-hero-score"><Sparkles/><span>Melhor aderência</span><b>93%</b></div></div>
      <div className="malha-match-layout">
        <section className="malha-match-summary">
          <span>OPORTUNIDADE ATIVA</span><h2>{selected.name}</h2><p>{selected.kind} · {selected.city}</p>
          <dl><div><dt>Estrutura</dt><dd>{selected.structure}</dd></div><div><dt>Capital</dt><dd>{money(selected.capital)}</dd></div><div><dt>Prontidão</dt><dd>{selected.readiness}/100</dd></div><div><dt>Confiança</dt><dd>{selected.confidence}%</dd></div></dl>
          <div className="malha-risk-note"><ShieldCheck/><span><b>Triagem concluída</b>{selected.risk}</span></div>
        </section>
        <section className="malha-investor-list">
          {investorMatches.map((investor) => <article key={investor.id}>
            <div className="malha-investor-top"><div className="malha-investor-avatar">{investor.name.split(" ").slice(0,2).map((part) => part[0]).join("")}</div><div><h3>{investor.name}</h3><p>{investor.type} · Ticket {investor.ticket}</p></div><b>{investor.fit}%</b></div>
            <div className="malha-fit-bars">{[["Geografia",investor.geography],["Capital",investor.capital],["Estrutura",investor.structure]].map(([label, value]) => <div key={String(label)}><span>{label}</span><i><em style={{ width: `${value}%` }} /></i><b>{value}</b></div>)}</div>
            <div className="malha-investor-foot"><span><Database/> {investor.precedent}</span><button className={connected.includes(investor.id) ? "connected" : ""} onClick={() => { setConnected((current) => current.includes(investor.id) ? current : [...current, investor.id]); toast.success(`Solicitação enviada para ${investor.name}`); }}>{connected.includes(investor.id) ? <><Check/> Solicitado</> : <><Send/> Solicitar conexão</>}</button></div>
          </article>)}
        </section>
      </div>
    </div>
  );
}

function DealRoomWorkspace({ selected }: { selected: Opportunity }) {
  const [documents, setDocuments] = useState(dealDocuments);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateUpload = () => {
    setDocuments((current) => current.map((document, index) => index === 2 ? { ...document, status: "revisão", updated: "Enviado agora" } : document));
    toast.success("Documento enviado para revisão");
  };
  return (
    <div className="malha-workspace-page">
      <div className="malha-page-intro"><div><span>Ambiente confidencial</span><h1>Deal Room</h1><p>{selected.name} · acesso controlado e trilha de auditoria</p></div><button className="malha-primary" onClick={() => inputRef.current?.click()}><Upload/> Enviar documento</button><input ref={inputRef} hidden type="file" onChange={updateUpload}/></div>
      <div className="malha-deal-kpis"><div><FileCheck2/><span>Validados</span><b>{documents.filter((item) => item.status === "validado").length}</b></div><div><FileClock/><span>Em revisão</span><b>{documents.filter((item) => item.status === "revisão").length}</b></div><div><Clock3/><span>Pendências</span><b>{documents.filter((item) => item.status === "pendente").length}</b></div><div><ShieldCheck/><span>Completude</span><b>78%</b></div></div>
      <section className="malha-document-table">
        <div className="malha-table-head"><span>Documento</span><span>Grupo</span><span>Status</span><span>Atualização</span><span /></div>
        {documents.map((document) => <div className="malha-table-row" key={document.id}><span><FileText/><b>{document.name}</b></span><span>{document.group}</span><span><i className={`status ${document.status}`}/>{document.status}</span><span>{document.updated}</span><button onClick={() => toast.info(`${document.name}: acesso registrado`)}>Abrir <ChevronRight/></button></div>)}
      </section>
    </div>
  );
}

function PipelineWorkspace() {
  const [deals, setDeals] = useState([
    { id:1, name:"Vetor Leste 365", value:286, stage:0 },{ id:2, name:"Eixo MG-190", value:164, stage:0 },
    { id:3, name:"Sítio Santa Luzia", value:420, stage:1 },{ id:4, name:"Reserva Norte", value:208, stage:1 },
    { id:5, name:"Eixo Sul Uberlândia", value:198, stage:2 },{ id:6, name:"Parque das Árvores", value:518, stage:3 },
  ]);
  const stages = ["Mapeada","Em análise","Em estruturação","Em negociação","Contratada"];
  const move = (id: number) => setDeals((current) => current.map((deal) => deal.id === id ? { ...deal, stage: Math.min(4, deal.stage + 1) } : deal));
  return (
    <div className="malha-workspace-page malha-pipeline-page">
      <div className="malha-page-intro"><div><span>Gestão do dealflow</span><h1>Pipeline</h1><p>Da originação territorial ao fechamento da operação.</p></div><div className="malha-pipeline-total"><span>VGV monitorado</span><b>R$ 1,79 bi</b></div></div>
      <div className="malha-kanban">{stages.map((stage, stageIndex) => <section key={stage}><header><span>{stage}</span><b>{deals.filter((deal) => deal.stage === stageIndex).length}</b></header>{deals.filter((deal) => deal.stage === stageIndex).map((deal) => <article key={deal.id}><span>OP-{String(deal.id).padStart(3,"0")}</span><h3>{deal.name}</h3><p>VGV {money(deal.value)}</p><div><i style={{ width: `${28 + stageIndex * 18}%` }}/></div>{stageIndex < 4 && <button onClick={() => { move(deal.id); toast.success(`${deal.name} avançou para ${stages[stageIndex + 1]}`); }}>Avançar <ChevronRight/></button>}</article>)}</section>)}</div>
    </div>
  );
}

function CreateOpportunity({ close }: { close: () => void }) {
  const [step, setStep] = useState(1);
  return (
    <div className="malha-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && close()}>
      <div className="malha-modal" role="dialog" aria-modal="true" aria-label="Nova oportunidade">
        <button className="malha-close" onClick={close}><X/></button><span>NOVA ORIGINAÇÃO</span><h2>Cadastrar oportunidade</h2><div className="malha-modal-steps"><i className="active">1</i><em/><i className={step > 1 ? "active" : ""}>2</i><em/><i className={step > 2 ? "active" : ""}>3</i></div>
        {step === 1 && <div className="malha-form"><label>Nome da área<input defaultValue="Nova gleba" /></label><label>Município<input placeholder="Ex.: Uberlândia" /></label><label>Estrutura pretendida<select defaultValue="Permuta financeira"><option>Permuta financeira</option><option>Venda</option><option>Joint venture</option><option>Equity</option></select></label></div>}
        {step === 2 && <label className="malha-dropzone"><Upload/><b>Importe a poligonal</b><span>KML ou KMZ · até 20 MB</span><input type="file" accept=".kml,.kmz"/></label>}
        {step === 3 && <div className="malha-review"><ShieldCheck/><h3>Pronta para triagem</h3><p>A oportunidade será criada como “Mapeada” e seguirá para validação dominial e territorial.</p></div>}
        <div className="malha-modal-actions"><button onClick={step === 1 ? close : () => setStep(step - 1)}>Voltar</button><button className="malha-primary" onClick={() => step < 3 ? setStep(step + 1) : (toast.success("Oportunidade adicionada à triagem"), close())}>{step < 3 ? <>Continuar <ChevronRight/></> : <><Check/> Concluir</>}</button></div>
      </div>
    </div>
  );
}

export default function MalhaApp() {
  const [workspace, setWorkspace] = useState<Workspace>("overview");
  const [selected, setSelected] = useState<Opportunity | null>(opportunities[0]);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Triângulo Mineiro, MG");
  const [mobileNav, setMobileNav] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const activeOpportunity = selected ?? opportunities[0];

  const workspaceContent = useMemo(() => {
    if (workspace === "overview") return <Overview selected={selected} setSelected={setSelected} query={query} go={setWorkspace}/>;
    if (workspace === "territorial") return <div className="malha-territorial-host"><TerritorialIntelligence/></div>;
    if (workspace === "opportunities") return <OpportunityWorkspace query={query} openCreate={() => setCreateOpen(true)} select={(item) => { setSelected(item); setWorkspace("overview"); }}/>
    if (workspace === "matches") return <MatchesWorkspace selected={activeOpportunity}/>;
    if (workspace === "dealroom") return <DealRoomWorkspace selected={activeOpportunity}/>;
    return <PipelineWorkspace/>;
  }, [workspace, selected, query, activeOpportunity]);

  return (
    <div className="malha-shell">
      <aside className={mobileNav ? "malha-sidebar open" : "malha-sidebar"}>
        <div className="malha-brand"><Image src="/malha-logo.svg" alt="MALHA by Évora" width={184} height={72} priority/><button onClick={() => setMobileNav(false)} aria-label="Fechar menu"><PanelLeftClose/></button></div>
        <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={workspace === item.id ? "active" : ""} onClick={() => { setWorkspace(item.id); setMobileNav(false); }}><Icon/><span>{item.label}</span></button>; })}</nav>
        <div className="malha-sidebar-landscape" aria-hidden="true"><svg viewBox="0 0 240 130"><path d="M-10 112C35 90 62 103 91 72C119 42 153 50 181 23C204 1 225 12 251-5M-10 125C42 105 68 116 103 86C137 57 165 67 200 37C225 16 241 22 257 10"/><path d="M0 104L35 87L62 89L91 67L127 68L157 47L198 43L235 19"/><circle cx="50" cy="108" r="9"/><path d="M50 99V124M50 108L39 115M50 108L61 114"/></svg></div>
        <div className="malha-sidebar-foot"><span className="live"/><div><b>Base operacional</b><span>Atualizada em 02 set 2026</span></div></div>
      </aside>
      <main>
        <header className="malha-topbar">
          <button className="malha-mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu/></button>
          <h1>{pageTitles[workspace]}</h1>
          <label className="malha-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar áreas, bairros, cidades..."/>{query && <button onClick={() => setQuery("")} aria-label="Limpar busca"><X/></button>}</label>
          <label className="malha-location"><MapPinned/><select value={location} onChange={(event) => { setLocation(event.target.value); toast.info(`Região alterada para ${event.target.value}`); }}><option>Triângulo Mineiro, MG</option><option>Alto Paranaíba, MG</option><option>Interior de São Paulo</option></select><ChevronDown/></label>
          <button className="malha-notification" onClick={() => toast.info("3 atualizações: um novo match e duas pendências documentais")} aria-label="Notificações"><Bell/><span>3</span></button>
          <button className="malha-profile" onClick={() => toast.info("Perfil executivo · Franco Alves")}><span>FA</span><ChevronDown/></button>
        </header>
        <div className="malha-workspace">{workspaceContent}</div>
      </main>
      {createOpen && <CreateOpportunity close={() => setCreateOpen(false)}/>} 
      <Toaster theme="dark" richColors position="top-right"/>
    </div>
  );
}
