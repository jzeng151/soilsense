import { Hono } from "hono";
import type { AppEnv } from "./auth";
import { getSmap, discoverSmap } from "../data/smap";
export const smap = new Hono<AppEnv>();
smap.get("/catalog", async c => c.json(await discoverSmap(c.env)));
smap.get("/",async c=>{
 const lat=Number(c.req.query("lat")),lon=Number(c.req.query("lon")),year=Number(c.req.query("year")??"2022");
 if (!c.req.query("lat") || !c.req.query("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || lat<24 || lat>50 || lon< -125 || lon> -66 || !Number.isInteger(year) || year<1991 || year>2100) return c.json({error:"Valid contiguous-US coordinates and integer year required"},400);
 return c.json(await getSmap(c.env,lat,lon,year));
});
