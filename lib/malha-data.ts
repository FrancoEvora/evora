export type Point = [number, number];

export type Opportunity = {
  id: string;
  name: string;
  city: string;
  region: string;
  kind: string;
  areaHa: number;
  vgv: number;
  capital: number;
  fit: number;
  readiness: number;
  confidence: number;
  stage: string;
  structure: string;
  risk: string;
  color: string;
  center: Point;
  polygon: Point[];
  trend: number[];
};

export const opportunities: Opportunity[] = [
  {
    id: "op-001",
    name: "Gleba Sítio Santa Luzia",
    city: "Uberlândia",
    region: "Triângulo Mineiro",
    kind: "Bairro planejado",
    areaHa: 41.8,
    vgv: 420,
    capital: 28,
    fit: 89,
    readiness: 72,
    confidence: 84,
    stage: "Em análise",
    structure: "Equity + permuta financeira",
    risk: "Solução de esgotamento em validação",
    color: "#d39251",
    center: [-48.3448, -18.9282],
    polygon: [[-48.3592,-18.9398],[-48.3496,-18.9462],[-48.3322,-18.9416],[-48.3295,-18.9257],[-48.3409,-18.9151],[-48.3571,-18.9194]],
    trend: [82,115,156,203,248,302,357,420],
  },
  {
    id: "op-002",
    name: "Vetor Leste 365",
    city: "Uberlândia",
    region: "Triângulo Mineiro",
    kind: "Desenvolvimento multiuso",
    areaHa: 27.4,
    vgv: 286,
    capital: 19,
    fit: 86,
    readiness: 64,
    confidence: 79,
    stage: "Mapeada",
    structure: "SPE + dívida sênior",
    risk: "Diretriz viária pendente",
    color: "#c87f42",
    center: [-48.1922, -18.9025],
    polygon: [[-48.2050,-18.9116],[-48.1951,-18.9168],[-48.1810,-18.9087],[-48.1803,-18.8956],[-48.1958,-18.8889],[-48.2063,-18.8970]],
    trend: [42,78,109,142,181,217,253,286],
  },
  {
    id: "op-003",
    name: "Eixo Sul Uberlândia",
    city: "Uberlândia",
    region: "Triângulo Mineiro",
    kind: "Residencial horizontal",
    areaHa: 18.7,
    vgv: 198,
    capital: 12,
    fit: 82,
    readiness: 81,
    confidence: 88,
    stage: "Em estruturação",
    structure: "Dívida + capital proprietário",
    risk: "Topografia favorável",
    color: "#e0a66a",
    center: [-48.2731, -19.0154],
    polygon: [[-48.2840,-19.0241],[-48.2712,-19.0274],[-48.2625,-19.0160],[-48.2692,-19.0053],[-48.2829,-19.0092]],
    trend: [31,49,76,101,126,151,177,198],
  },
  {
    id: "op-004",
    name: "Parque das Árvores",
    city: "Monte Carmelo",
    region: "Alto Paranaíba",
    kind: "Bairro planejado",
    areaHa: 94.2,
    vgv: 518,
    capital: 35,
    fit: 94,
    readiness: 88,
    confidence: 93,
    stage: "Em negociação",
    structure: "Coinvestimento + recebíveis",
    risk: "Obras em andamento",
    color: "#be7137",
    center: [-47.4974, -18.7202],
    polygon: [[-47.5148,-18.7361],[-47.4941,-18.7413],[-47.4775,-18.7268],[-47.4824,-18.7040],[-47.5066,-18.7018],[-47.5180,-18.7165]],
    trend: [102,171,226,294,349,412,468,518],
  },
  {
    id: "op-005",
    name: "Eixo MG-190",
    city: "Patrocínio",
    region: "Alto Paranaíba",
    kind: "Agrocenter e logística",
    areaHa: 32.6,
    vgv: 164,
    capital: 16,
    fit: 78,
    readiness: 57,
    confidence: 75,
    stage: "Mapeada",
    structure: "Joint venture",
    risk: "Acesso rodoviário sob estudo",
    color: "#cc8750",
    center: [-46.9914, -18.9435],
    polygon: [[-47.0052,-18.9518],[-46.9921,-18.9580],[-46.9786,-18.9500],[-46.9803,-18.9355],[-46.9961,-18.9318],[-47.0076,-18.9396]],
    trend: [24,43,62,83,105,126,145,164],
  },
];

export const investorMatches = [
  { id:"inv-01", name:"Fundo Cerrado Desenvolvimento", type:"Fundo de crédito", ticket:"R$ 20–50 mi", fit:93, geography:98, capital:94, structure:88, precedent:"4 operações em loteamentos", status:"Prioritário" },
  { id:"inv-02", name:"Family Office Horizonte", type:"Family office", ticket:"R$ 10–30 mi", fit:87, geography:91, capital:89, structure:82, precedent:"2 operações no interior de MG", status:"Alta aderência" },
  { id:"inv-03", name:"Securitizadora Atlas", type:"Securitizadora", ticket:"R$ 15–80 mi", fit:81, geography:76, capital:96, structure:78, precedent:"Recebíveis e crédito-ponte", status:"Condicionado" },
  { id:"inv-04", name:"Capital Raízes", type:"Gestora independente", ticket:"R$ 8–25 mi", fit:76, geography:84, capital:73, structure:71, precedent:"Residencial horizontal", status:"Em avaliação" },
];

export const initialPipeline = [
  { key:"mapped", label:"Mapeadas", count:24, value:320, active:false },
  { key:"analysis", label:"Em análise", count:16, value:410, active:true },
  { key:"structuring", label:"Em estruturação", count:8, value:350, active:false },
  { key:"negotiation", label:"Em negociação", count:5, value:280, active:false },
  { key:"closed", label:"Contratadas", count:3, value:120, active:false },
];

export const dealDocuments = [
  { id:"doc-1", name:"Matrícula atualizada", group:"Dominial", status:"validado", updated:"Hoje, 14:32" },
  { id:"doc-2", name:"Levantamento planialtimétrico", group:"Técnico", status:"validado", updated:"01 set, 18:10" },
  { id:"doc-3", name:"Diretrizes urbanísticas", group:"Urbanístico", status:"pendente", updated:"Prazo: 08 set" },
  { id:"doc-4", name:"Estudo de demanda", group:"Mercado", status:"validado", updated:"31 ago, 16:45" },
  { id:"doc-5", name:"Modelo econômico-financeiro", group:"Financeiro", status:"revisão", updated:"Hoje, 10:20" },
  { id:"doc-6", name:"Minuta do term sheet", group:"Negociação", status:"revisão", updated:"Prazo: 05 set" },
];
