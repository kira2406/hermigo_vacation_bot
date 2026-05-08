import { Annotation } from "@langchain/langgraph";

// Decision shape
export interface Decision {
  action: "ignore" | "delegate";
  reasoning: string;
  targetAgent?: "destination" | "itinerary" | "accommodation";
}

// Single source of truth — annotation lives here
export const VacationStateAnnotation = Annotation.Root({
  chatId: Annotation<string>(),
  messageId: Annotation<string | undefined>(),
  text: Annotation<string>(),
  sender: Annotation<string>(),
  participantCount: Annotation<number>(),
  vacationState: Annotation<"destination" | "itinerary" | "accommodation" | "complete">(),
  history: Annotation<any[]>({
    reducer: (_old, next) => next,
    default: () => [],
  }),
  recent_messages: Annotation<any[]>({
    reducer: (_old, next) => next,
    default: () => [],
  }),
  decision: Annotation<Decision | undefined>(),
  destination: Annotation<string | undefined>(),
  startDate: Annotation<NativeDate | undefined>(),
  endDate: Annotation<NativeDate | undefined>(),
  currentItinerary: Annotation<any[]>({
    reducer: (_old, next) => next,
    default: () => [],
  }),
  currentAccommodation: Annotation<any | undefined>(),
});

// Derive the interface FROM the annotation
export type VacationGraphState = typeof VacationStateAnnotation.State;