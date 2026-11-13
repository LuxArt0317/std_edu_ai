import type {InterdisciplinaryProgram} from '../../server/interdisciplinaryPrograms.js';

export async function readPublishedInterdisciplinaryPrograms(signal:AbortSignal):Promise<InterdisciplinaryProgram[]> {
  const response = await fetch('/api/affairs-data?scope=interdisciplinary-programs',{
    signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),
  });
  if (!response.ok) throw new Error('Program directory unavailable.');
  const data = await response.json();
  if (!Array.isArray(data?.programs)) throw new Error('Invalid program directory.');
  return data.programs;
}
