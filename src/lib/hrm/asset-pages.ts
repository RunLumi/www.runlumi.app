import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { assetEvents, listAssignablePeople, listManagedAssets, listMyAssets, type HrmAssetEvent, type HrmAssetPerson, type HrmAssetRow, type MyHrmAssetRow } from "./assets";
import { listAssetEvidenceForAsset, listMyAssetEvidence, type AssetEvidenceRow } from "./asset-attachments";

const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});

export interface AssetRegisterPage extends PageBase {assets:HrmAssetRow[];people:HrmAssetPerson[];events:HrmAssetEvent[];evidence:AssetEvidenceRow[];selectedAssetId:string;legalEntity:string;saved:string;error?:string}
export async function assetRegisterPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|AssetRegisterPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.assets.manage"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),[assets,people,settings]=await Promise.all([
  listManagedAssets(env.DB,user),listAssignablePeople(env.DB,env.CONTENT_DB,user),env.DB.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>(),
 ]);
 const selectedAssetId=astro.url.searchParams.get("asset")??"",selected=selectedAssetId&&assets.some(asset=>asset.id===selectedAssetId);
 if(selectedAssetId&&!selected)throw new HrmError("not_found",404);
 const [events,evidence]=selected?await Promise.all([assetEvents(env.DB,user,selectedAssetId),listAssetEvidenceForAsset(env.DB,user,selectedAssetId)]):[[],[]];
 return {...base(lang,user,lang==="vi"?"Quản lý tài sản":"Asset register"),assets,people,events,evidence,selectedAssetId,legalEntity:settings?.legal_entity??"",saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}

export interface MyAssetsPage extends PageBase {assets:MyHrmAssetRow[];evidence:AssetEvidenceRow[];saved:string;error?:string}
export async function myAssetsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|MyAssetsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.assets.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),[assets,evidence]=await Promise.all([listMyAssets(env.DB,user),listMyAssetEvidence(env.DB,user)]);
 return {...base(lang,user,lang==="vi"?"Tài sản của tôi":"My assets"),assets,evidence,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
