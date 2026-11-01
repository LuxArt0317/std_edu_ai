import { createFixtures, cleanupFixtures } from '../e2e/client-fixtures.mjs'
import { clientForRole } from '../helpers/role-client.mjs'
import { verifyLmsWorkflow } from '../helpers/lms-workflow.mjs'
try {
  const state = await createFixtures()
  const result = await verifyLmsWorkflow(state, await clientForRole(state, 'faculty'), await clientForRole(state, 'student'))
  console.log(JSON.stringify(result))
} finally { await cleanupFixtures() }
