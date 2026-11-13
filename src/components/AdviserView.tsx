import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type {
  AdviserResponse,
  BusinessProfile,
  ComplianceAssessmentItem,
  FinancialTransaction,
  VaultDocument,
} from '../../shared/types';
import { askAdviserApi } from '../lib/api';

interface AdviserViewProps {
  business: BusinessProfile;
  transactions: FinancialTransaction[];
  documents: VaultDocument[];
  compliance: ComplianceAssessmentItem[];
  onNavigate: (tab: string) => void;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AdviserResponse;
}

const SUGGESTED_QUESTIONS = [
  'How much did I spend this month?',
  'Which expenses increased?',
  'Am I spending more than I earn?',
  'Show me any documents expiring soon.',
  'What compliance items am I missing?',
  'Summarise my business performance.',
];

export function AdviserView({
  business,
  transactions,
  documents,
  compliance,
  onNavigate,
}: AdviserViewProps) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (q: string) => {
    if (!q.trim() || loading) return;
    const trimmed = q.trim();
    setQuestion('');
    setError(null);
    setTurns((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const reply = await askAdviserApi({
        question: trimmed,
        business,
        transactions,
        documents,
        compliance,
      });
      setTurns((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', text: reply.answer, response: reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Business Adviser.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Business Adviser</h1>
        <p className="mt-1 text-sm text-slate-600">
          Grounded strictly in {business.name}&apos;s authorised transactions, vault documents, and
          South African compliance rules. Only relevant records are retrieved per question.
        </p>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendQuestion(q)}
            className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-teal-700 hover:text-teal-800 cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Conversation Container */}
      <div className="rounded-xl border border-slate-200 bg-white flex flex-col min-h-[420px]">
        <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[520px]">
          {turns.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Ask a question about your ZAR cash flow, supplier spending, expiring permits, or SARS /
              CIPC / municipal compliance.
            </div>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={`max-w-3xl rounded-xl p-4 text-sm ${
                    turn.role === 'user'
                      ? 'bg-teal-700 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-900 space-y-3'
                  }`}
                >
                  <p className="whitespace-pre-line leading-relaxed">{turn.text}</p>

                  {turn.response && (
                    <>
                      <p className="border-t border-slate-200 pt-2 text-xs text-slate-600">
                        {turn.response.distinctions}
                      </p>

                      {turn.response.citations.length > 0 && (
                        <div className="border-t border-slate-200 pt-2">
                          <p className="text-xs font-semibold text-slate-700">
                            Supporting Records Cited:
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-600">
                            {turn.response.citations.map((cit, i) => (
                              <li key={i}>
                                • <strong>{cit.label}</strong> — {cit.excerpt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {turn.response.proposedAction?.requiresConfirmation && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
                          <span>{turn.response.proposedAction.description}</span>
                          <button
                            type="button"
                            onClick={() => onNavigate('finances')}
                            className="shrink-0 font-semibold underline cursor-pointer"
                          >
                            Review in Finances
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-teal-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Retrieving matching business records and drafting answer...</span>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(question);
          }}
          className="border-t border-slate-200 p-3 flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your finances, documents, or compliance..."
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-teal-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
