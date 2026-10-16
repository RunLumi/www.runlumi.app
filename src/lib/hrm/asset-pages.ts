import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { assetEvents, listAssignablePeople, listManagedAssets, listMyAssets, managedAssetById, type HrmAssetEvent, type HrmAssetPerson, type HrmAssetRow, type MyHrmAssetRow } from "./assets";
import { listAssetEvidenceForAsset, listMyAssetEvidence, type AssetEvidenceRow } from "./asset-attachments";
import { listAssetReminders, type AssetReminder } from "./asset-reminders";

const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});

export interface AssetRegisterPage extends PageBase {assets:HrmAssetRow[];assetPage:number;hasMoreAssets:boolean;people:HrmAssetPerson[];events:HrmAssetEvent[];evidence:AssetEvidenceRow[];reminders:AssetReminder[];reminderPage:number;hasMoreReminders:boolean;selectedAssetId:string;selectedAsset:HrmAssetRow|null;legalEntity:string;saved:string;error?:string}
function pageNumber(astro:AstroGlobal,key:string):number{const value=Number(astro.url.searchParams.get(key)??1);return Number.isFinite(value)?Math.max(1,Math.min(1000,Math.floor(value))):1}
export async function assetRegisterPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|AssetRegisterPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.assets.manage"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),assetPage=pageNumber(astro,"asset_page"),reminderPage=pageNumber(astro,"reminder_page"),[assetsResult,people,settings,remindersResult]=await Promise.all([
  listManagedAssets(env.DB,user,assetPage),listAssignablePeople(env.DB,env.CONTENT_DB,user),env.DB.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>(),listAssetReminders(env.DB,user,reminderPage),
 ]);
 const selectedAssetId=astro.url.searchParams.get("asset")??"",selectedAsset=selectedAssetId?await managedAssetById(env.DB,user,selectedAssetId):null;
 const [events,evidence]=selectedAssetId?await Promise.all([assetEvents(env.DB,user,selectedAssetId),listAssetEvidenceForAsset(env.DB,user,selectedAssetId)]):[[],[]];
 return {...base(lang,user,lang==="vi"?"Quản lý tài sản":"Asset register"),assets:assetsResult.rows,assetPage:assetsResult.page,hasMoreAssets:assetsResult.hasMore,people,events,evidence,reminders:remindersResult.reminders,reminderPage:remindersResult.page,hasMoreReminders:remindersResult.hasMore,selectedAssetId,selectedAsset,legalEntity:settings?.legal_entity??"",saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}

export interface MyAssetsPage extends PageBase {assets:MyHrmAssetRow[];assetPage:number;hasMoreAssets:boolean;evidence:AssetEvidenceRow[];reminders:AssetReminder[];reminderPage:number;hasMoreReminders:boolean;saved:string;error?:string}
export async function myAssetsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|MyAssetsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.assets.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),assetPage=pageNumber(astro,"asset_page"),reminderPage=pageNumber(astro,"reminder_page"),[assetsResult,evidence,remindersResult]=await Promise.all([listMyAssets(env.DB,user,assetPage),listMyAssetEvidence(env.DB,user),listAssetReminders(env.DB,user,reminderPage)]);
 return {...base(lang,user,lang==="vi"?"Tài sản của tôi":"My assets"),assets:assetsResult.rows,assetPage:assetsResult.page,hasMoreAssets:assetsResult.hasMore,evidence,reminders:remindersResult.reminders,reminderPage:remindersResult.page,hasMoreReminders:remindersResult.hasMore,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
