/** A response may populate only the identity/generation that requested it. */
export class SessionCache<T> {
  private identity = ''
  private generation = 0
  private value: T | null = null
  begin(identity: string) {
    if (this.identity !== identity) { this.clear(); this.identity = identity }
    return this.generation
  }
  read(identity: string) { return identity === this.identity ? this.value : null }
  write(identity: string, generation: number, value: T) {
    if (identity !== this.identity || generation !== this.generation) return false
    this.value = value
    return true
  }
  clear() { this.identity = ''; this.value = null; this.generation++ }
}
