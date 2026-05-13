import type { LucideIcon } from 'lucide-react';
import { Zap, Scissors, Minus, BookOpen, Award } from 'lucide-react';
import type { ResponseStyle } from '@/types/chat';

export const RESPONSE_STYLES: {
  id: ResponseStyle;
  label: string;
  description: string;
  icon: LucideIcon;
  systemPromptSuffix: string;
}[] = [
  {
    id: 'concise',
    label: 'Concise',
    description: 'Focused responses prioritizing key findings.',
    icon: Scissors,
    systemPromptSuffix: `When responding, prioritize high-confidence information from retrieved documents.
Keep responses focused on direct answers—2-4 sentences maximum unless critical context requires expansion.
Cite only the most salient document passages that directly support your answer.
Filter out tangential details and maintain a direct, purposeful tone.`,
  },
  {
    id: 'very-concise',
    label: 'Very Concise',
    description: 'Ultra-distilled answers, 1-2 sentences.',
    icon: Minus,
    systemPromptSuffix: `Deliver responses in exactly 1-2 sentences.
Extract only the absolute core fact or answer. Prioritize information density—every word must carry meaning.
Use citations only when the answer directly derives from attached documents.
For complex questions, present the single most important insight.`,
  },
  {
    id: 'explanatory',
    label: 'Explanatory',
    description: 'Detailed exploration with reasoning.',
    icon: BookOpen,
    systemPromptSuffix: `Provide comprehensive responses that explore context, reasoning, and implications.
Draw multi-sourced connections from retrieved documents to explain the "why" behind answers.
Structure responses with clear logical progression: setup → evidence → reasoning → synthesis.
Include relevant citations to document sources and enable reader verification.
Aim for pedagogical clarity—assume the reader wants deep understanding, not just facts.`,
  },
  {
    id: 'formal',
    label: 'Formal',
    description: 'Professional, structured presentation.',
    icon: Award,
    systemPromptSuffix: `Use precise, professional terminology aligned with domain standards.
Structure responses with formal clarity: executive summary → detailed analysis → citations.
Adopt an authoritative, measured tone appropriate for technical, legal, or academic contexts.
Ensure citations follow formal conventions and reference document titles/dates where available.
Minimize colloquialisms and maintain consistent register throughout.`,
  },
  {
    id: 'normal',
    label: 'Normal',
    description: 'Balanced, natural conversational style.',
    icon: Zap,
    systemPromptSuffix: `Deliver balanced responses that blend clarity with natural conversational flow.
Reference attached documents when they provide relevant context or evidence.
Use citations to ground claims in retrieved sources, improving response credibility and traceability.
Maintain an accessible, engaging tone suitable for general audiences.`,
  },
];

export function getResponseStyleLabel(style: ResponseStyle | null | undefined) {
  if (!style) return 'Normal';
  return RESPONSE_STYLES.find((item) => item.id === style)?.label ?? 'Normal';
}

export function getResponseStyleIcon(style: ResponseStyle | null | undefined) {
  if (!style) return Zap;
  return RESPONSE_STYLES.find((item) => item.id === style)?.icon ?? Zap;
}
