import { CompletionDecision } from '@/components/completion';

// UC07.4, fluxo 1 — o cliente confirma a conclusão registrada pelo prestador. `id` (e `from`) por parâmetro.
export default function ConfirmCompletion() {
  return <CompletionDecision mode="confirm" />;
}
