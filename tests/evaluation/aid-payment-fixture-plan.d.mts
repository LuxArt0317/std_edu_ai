type AidPaymentFixtureRow = Readonly<Record<string, string | number | null>>;
type AidPaymentFixtureOwner = Readonly<Record<'claims' | 'salary', readonly AidPaymentFixtureRow[]>>;

export const aidPaymentFixtureManifest: Readonly<{
  A: AidPaymentFixtureOwner;
  B: AidPaymentFixtureOwner;
}>;
