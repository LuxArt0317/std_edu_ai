import { cleanupFixtures } from './client-fixtures.mjs'
export default async function teardown() { await cleanupFixtures() }
