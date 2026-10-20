import type {PublicSource,SourceRun} from './Sources';
import type {WbsBaseline,WorkItem,License,Financial,Study,MarketPoint,Report,ReportAccess,ModuleGrant} from './enterprise';
export type Role='owner'|'admin'|'manager'|'analyst'|'viewer'|'client';
export type Stage='intelligence'|'structuring'|'development'|'management';
export type Asset={id:string;workspace_id:string;name:string;division:'urban'|'rural';stage:Stage;city:string;state:string;address:string;area_ha:number|null;estimated_value:number|null;latitude:number|null;longitude:number|null;geometry:unknown;municipality_code?:string;polygon_area_ha?:number;notes:string;status:string;created_at:string;created_by:string};
export type Member={workspace_id:string;user_id:string;display_name:string;email:string;role:Role;active:boolean};
export type Workspace={id:string;name:string;created_by:string;is_demo?:boolean};
export type Action={id:string;workspace_id:string;asset_id:string;title:string;description:string;priority:'low'|'medium'|'high'|'critical';status:'todo'|'doing'|'done';due_on:string|null;assignee_id:string|null;evidence:string;category:string;created_at:string};
export type Doc={id:string;workspace_id:string;asset_id:string;title:string;storage_path:string;category:string;mime_type:string;size_bytes:number;extracted_text:string;expires_on:string|null;created_at:string};
export type Note={id:string;asset_id:string;body:string;created_by:string;latitude:number|null;longitude:number|null;created_at:string};
export type Run={id:string;asset_id:string;prompt:string;result:string;model:string;source:string;created_at:string};
export type Alert={id:string;asset_id:string;title:string;severity:string;created_at:string;read_at:string|null};
export type Schedule={id:string;asset_id:string;name:string;prompt:string;cadence:string;enabled:boolean;next_run_at:string;last_run_at:string|null;last_status:string|null};
export type Audit={id:number;actor_id:string|null;action:string;entity:string;entity_id:string;created_at:string};
export type Invite={id:string;email:string;role:Role;expires_at:string;accepted_at:string|null;revoked_at:string|null};
export type Data={wbsBaselines:WbsBaseline[];sources:PublicSource[];sourceRuns:SourceRun[];assets:Asset[];actions:Action[];docs:Doc[];notes:Note[];runs:Run[];alerts:Alert[];schedules:Schedule[];members:Member[];audit:Audit[];invites:Invite[];workItems:WorkItem[];licenses:License[];financial:Financial[];studies:Study[];points:MarketPoint[];reports:Report[];reportAccess:ReportAccess[];moduleGrants:ModuleGrant[]};
export const emptyData:Data={wbsBaselines:[],sources:[],sourceRuns:[],assets:[],actions:[],docs:[],notes:[],runs:[],alerts:[],schedules:[],members:[],audit:[],invites:[],workItems:[],licenses:[],financial:[],studies:[],points:[],reports:[],reportAccess:[],moduleGrants:[]};
export const stageNames:Record<Stage,string>={intelligence:'Inteligência',structuring:'Estruturação',development:'Desenvolvimento',management:'Gestão de ativos'};
export const roleNames:Record<Role,string>={owner:'Proprietário',admin:'Administrador',manager:'Gestor',analyst:'Analista',viewer:'Consulta',client:'Cliente'};
export const stageCopy:Record<Stage,{line:string;description:string;focus:string[]}>={
 intelligence:{line:'Enxergue o potencial. Antecipe os riscos.',description:'Viabilidade mercadológica, ambiental, técnica e documental para decidir o próximo passo.',focus:['Mercado e vocação','Território e restrições','Due diligence','Decisão de investimento']},
 structuring:{line:'Transforme potencial em um negócio viável.',description:'Negociação da área, definição de produto, orçamento e estrutura da operação.',focus:['Negociação da área','Produto e premissas','Modelo de parceria','Dossiê da operação']},
 development:{line:'Da estratégia à execução, com clareza.',description:'Projetos, licenciamento, aprovações, implantação e preparação comercial.',focus:['Projetos e aprovações','Licenciamento ambiental','Implantação e obras','Estratégia comercial']},
 management:{line:'Patrimônio acompanhado. Decisões informadas.',description:'Documentos, obrigações, contratos e revisão contínua da estratégia de cada ativo.',focus:['Obrigações e prazos','Documentos e contratos','Desempenho do ativo','Estratégia patrimonial']}
};
