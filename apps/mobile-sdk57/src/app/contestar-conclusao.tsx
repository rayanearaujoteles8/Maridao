import { CompletionDecision } from '@/components/completion';

// UC07.4, fluxo 2 — o cliente contesta, com motivo, a conclusão registrada pelo prestador. `id` (e `from`) por parâmetro.
export default function ContestCompletion() {
  return <CompletionDecision mode="contest" />;
}
