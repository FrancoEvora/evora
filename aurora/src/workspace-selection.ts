type AvailableWorkspace={id:string;is_demo?:boolean;asset_count?:number};
export function chooseWorkspace(workspaces:AvailableWorkspace[], choices:{current?:string;requested?:string;saved?:string}={}){
 for(const id of [choices.current,choices.requested,choices.saved])if(id&&workspaces.some(w=>w.id===id))return id;
 return workspaces.find(w=>!w.is_demo&&(w.asset_count||0)>0)?.id
  ||workspaces.find(w=>w.is_demo&&(w.asset_count||0)>0)?.id
  ||workspaces.find(w=>!w.is_demo)?.id||workspaces[0]?.id||'';
}
export function readWorkspacePreference(userId:string){try{return localStorage.getItem('aurora.workspace.'+userId)||''}catch{return ''}}
export function saveWorkspacePreference(userId:string,workspaceId:string){try{localStorage.setItem('aurora.workspace.'+userId,workspaceId)}catch{/* Storage can be unavailable in private browsing. */}}
