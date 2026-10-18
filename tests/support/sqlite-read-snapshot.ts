import { DatabaseSync } from "node:sqlite";

/** Read one fresh point-in-time view while a separate local Worker owns the DB. */
export async function withSqliteReadSnapshot<T>(path:string,read:(database:DatabaseSync)=>T|Promise<T>):Promise<T>{
 const database=new DatabaseSync(path,{readOnly:true});
 try{
  // busy_timeout is per connection. Native readers otherwise fail immediately
  // on a concurrent writer/checkpoint; do not retry assertions or ignore errors.
  database.exec("PRAGMA busy_timeout=5000");
  database.exec("BEGIN");
  try{return await read(database)}finally{database.exec("ROLLBACK")}
 }finally{database.close()}
}
