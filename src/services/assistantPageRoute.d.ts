type PageLocation={origin:string;pathname:string;search:string};
type AssistantPageHost={location:PageLocation;parent?:{location:PageLocation}};
export function assistantPageRoute(embedded:boolean,host?:AssistantPageHost|null):string;
