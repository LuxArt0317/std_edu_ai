export declare const projectRef: string
export declare const stopAt: string

export declare function checkSupabaseActivity(options?: {
  now?: Date
  stopNow?: boolean
  key?: string
  request?: (url: string, init: RequestInit) => Promise<Response>
}): Promise<
  | { expired: true; queried: false; reason: 'manual_stop' | 'one_month_cutoff' }
  | { expired: false; queried: true; rows: number }
>
