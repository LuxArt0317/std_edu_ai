type Request={method?:string;headers:Record<string,string|string[]|undefined>;query?:Record<string,string|string[]|undefined>};
type Response={status:(code:number)=>Response;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
type Dependencies={fetchRequest?:typeof fetch;env?:NodeJS.ProcessEnv;database?:()=>{url:string;key:string}};
export function createAnnouncementEmailDelivery(dependencies?:Dependencies):(request:Request,response:Response)=>Promise<void>;
export const deliverAnnouncementEmail:ReturnType<typeof createAnnouncementEmailDelivery>;
export function announcementDeliveryConfigured(env?:NodeJS.ProcessEnv):boolean;
