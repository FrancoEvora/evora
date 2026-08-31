import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { scenarios } from "@/db/schema";
export async function GET(){try{return Response.json({scenarios:await getDb().select().from(scenarios).orderBy(desc(scenarios.id)).limit(30)})}catch(error){return Response.json({error:error instanceof Error?error.message:"Erro inesperado"},{status:500})}}
export async function POST(request:Request){try{const body=await request.json() as {name?:string;module?:string;parameters?:unknown;results?:unknown};if(!body.name)return Response.json({error:"name é obrigatório"},{status:400});const [scenario]=await getDb().insert(scenarios).values({name:body.name,module:body.module??"laboratorio",parameters:JSON.stringify(body.parameters??{}),results:JSON.stringify(body.results??{}),ownerRole:"CEO / Diretoria"}).returning();return Response.json({scenario},{status:201})}catch(error){return Response.json({error:error instanceof Error?error.message:"Erro inesperado"},{status:500})}}
