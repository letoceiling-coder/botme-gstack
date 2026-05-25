import { OperatorPlatform } from './components/operator-platform';
import type { AuthMeResponse } from './lib/api';

interface OperatorAppProps {
  session: AuthMeResponse;
}

export function OperatorApp({ session }: OperatorAppProps) {
  return <OperatorPlatform session={session} />;
}
