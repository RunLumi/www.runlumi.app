// Wards, communes and special zones of one province (official list after the
// 2025 merger), for the ward picker when the province changes. Public data,
// prerendered as static JSON.
import type { APIRoute } from "astro";
import { provinces } from "../../lib/crm/area";

export const prerender = true;

export function getStaticPaths() {
  return provinces.map((province) => ({ params: { code: province.code } }));
}

export const GET: APIRoute = ({ params }) => {
  const province = provinces.find((item) => item.code === params.code);
  const wards = (province?.wards ?? []).map((ward) => ward.fullName).sort((a, b) => a.localeCompare(b, "vi"));
  return new Response(JSON.stringify(wards), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
