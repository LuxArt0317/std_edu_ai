/** Server configuration only: never accept a client-supplied time budget. */
export function assistantRequestBudgetMs(env=process.env){
 const value=env.ASSISTANT_REQUEST_BUDGET_MS;
 if(typeof value!=='string'||!/^\d+$/u.test(value))return 55_000;
 const budget=Number(value);
 return Number.isSafeInteger(budget)&&budget>=5_000&&budget<=115_000?budget:55_000;
}
export function assistantRequestDeadline(started,parentDeadline=Infinity,env=process.env){
 return Math.min(started+assistantRequestBudgetMs(env),Number.isFinite(parentDeadline)?parentDeadline:Infinity);
}
