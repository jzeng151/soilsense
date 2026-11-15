import { Hono } from "hono";
import type { AppEnv } from "./auth";
import { getGraceWells } from "../data/grace";
export const groundwater=new Hono<AppEnv>();
groundwater.get("/",async c=>{
 const lat=Number(c.req.query("lat")),lon=Number(c.req.query("lon"));
 if(!c.req.query("lat")||!c.req.query("lon")||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -125||lon> -66)return c.json({error:"Valid contiguous-US coordinates required"},400);
 return c.json(await getGraceWells(c.env.DB,lat,lon));
});
