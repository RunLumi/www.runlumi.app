import { HrmError, readableFileType } from "./fields";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_LEGAL_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LEGAL_MULTIPART_BYTES = MAX_LEGAL_FILE_BYTES + 256 * 1024;

/** Cap the whole multipart stream, including chunked requests without Content-Length. */
export async function readLegalForm(request:Request,maxBytes=MAX_LEGAL_MULTIPART_BYTES):Promise<FormData>{
 const declared=request.headers.get("content-length");
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))throw new HrmError("request_too_large",413);
 const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}
 }catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}

const u16=(bytes:Uint8Array,at:number)=>bytes[at]|(bytes[at+1]<<8);
const u32=(bytes:Uint8Array,at:number)=>(bytes[at]|(bytes[at+1]<<8)|(bytes[at+2]<<16)|(bytes[at+3]<<24))>>>0;

/** Validate the ZIP directory and required OOXML parts without extracting or rendering untrusted DOCX content. */
export function isDocxPackage(bytes:Uint8Array):boolean{
 if(bytes.length<22||bytes[0]!==0x50||bytes[1]!==0x4b)return false;
 const start=Math.max(0,bytes.length-22-65535);let end=-1;
 for(let at=bytes.length-22;at>=start;at--)if(u32(bytes,at)===0x06054b50){end=at;break}
 if(end<0)return false;
 const disk=u16(bytes,end+4),directoryDisk=u16(bytes,end+6),diskEntries=u16(bytes,end+8),entryCount=u16(bytes,end+10),directorySize=u32(bytes,end+12),directoryOffset=u32(bytes,end+16),commentSize=u16(bytes,end+20);
 if(end+22+commentSize!==bytes.length||disk!==0||directoryDisk!==0||diskEntries!==entryCount||entryCount<2||entryCount>500||entryCount===0xffff||directoryOffset+directorySize>end)return false;
 const decoder=new TextDecoder("utf-8",{fatal:false}),names=new Set<string>();let cursor=directoryOffset,totalExpanded=0;
 for(let index=0;index<entryCount;index++){
  if(cursor+46>directoryOffset+directorySize||u32(bytes,cursor)!==0x02014b50)return false;
  const flags=u16(bytes,cursor+8),method=u16(bytes,cursor+10),compressed=u32(bytes,cursor+20),expanded=u32(bytes,cursor+24),nameSize=u16(bytes,cursor+28),extraSize=u16(bytes,cursor+30),comment=u16(bytes,cursor+32),startDisk=u16(bytes,cursor+34),localOffset=u32(bytes,cursor+42);
  const recordEnd=cursor+46+nameSize+extraSize+comment;if(recordEnd>directoryOffset+directorySize||startDisk!==0||(flags&1)!==0||(method!==0&&method!==8)||compressed===0&&expanded>0||expanded>15*1024*1024)return false;
  totalExpanded+=expanded;if(totalExpanded>25*1024*1024)return false;
  const name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameSize));
  if(!name||name.startsWith("/")||name.includes("\\")||name.split("/").some(part=>part==="..")||/[\x00-\x1f\x7f]/.test(name))return false;
  names.add(name);
  if(name==="[Content_Types].xml"||name==="word/document.xml"){
   if(localOffset+30>directoryOffset||u32(bytes,localOffset)!==0x04034b50)return false;
   const localName=u16(bytes,localOffset+26),localExtra=u16(bytes,localOffset+28),dataStart=localOffset+30+localName+localExtra;
   if(dataStart+compressed>directoryOffset||decoder.decode(bytes.slice(localOffset+30,localOffset+30+localName))!==name)return false;
  }
  cursor=recordEnd;
 }
 return cursor===directoryOffset+directorySize&&names.has("[Content_Types].xml")&&names.has("word/document.xml");
}

export async function readLegalUpload(file:File,kind:"docx_source"|"pdf_evidence"):Promise<{bytes:ArrayBuffer;mimeType:string;checksumInput:ArrayBuffer}>{
 if(file.size<=0||file.size>MAX_LEGAL_FILE_BYTES)throw new HrmError("file_size");
 const bytes=await file.arrayBuffer();const view=new Uint8Array(bytes);
 if(kind==="docx_source"){
  if(file.type!==DOCX_MIME||!file.name.toLowerCase().endsWith(".docx")||!isDocxPackage(view))throw new HrmError("legal_file_type");
  return {bytes,mimeType:DOCX_MIME,checksumInput:bytes};
 }
 if(file.type!=="application/pdf"||readableFileType(view)!=="application/pdf")throw new HrmError("file_type");
 return {bytes,mimeType:"application/pdf",checksumInput:bytes};
}
