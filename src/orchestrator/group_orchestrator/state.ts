import { Annotation } from "@langchain/langgraph";

type BuiltInReaction =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";

// Decision shape
export interface Decision {
  action: "reply" | "react" | "ignore" | "delegate";
  content?: string | BuiltInReaction; // The message text to send, or the emoji to react with
  reasoning: string;
  targetAgent?: "destination" | "itinerary" | "accommodation";
  // isConflict?: boolean;
  // isConsensus?: boolean;
  // confirmedDestination?: string;
}

// Single source of truth — annotation lives here
export const VacationStateAnnotation = Annotation.Root({
  chatId: Annotation<string>(),
  messageId: Annotation<string | undefined>(),
  text: Annotation<string>(),
  sender: Annotation<string>(),
  participantCount: Annotation<number>(),
  vacationState: Annotation<"destination" | "itinerary" | "accommodation" | "brainstorming" | "booking" | "finalized">(),
  history: Annotation<any[]>({
    reducer: (_old, next) => next,
    default: () => [],
  }),
  decision: Annotation<Decision | undefined>(),
});

// Derive the interface FROM the annotation — never diverges
export type VacationGraphState = typeof VacationStateAnnotation.State;