import { StateGraph, START, END } from "@langchain/langgraph";
import { VacationStateAnnotation, type Decision } from "./state.js"; // ← import from state
import { orchestratorNode } from "./nodes/orchestrator.js";
import { destinationNode } from "./nodes/destination.js";
import { itineraryNode } from "./nodes/itinerary.js";
import { getOrCreateConversation } from "../../services/conversation.service.js";
import { accommodationNode } from "./nodes/accommodation.js";
import { routeDecision } from "./router.js";

export interface GroupOrchestratorParams {
  chatId: string;
  messageId: string | undefined;
  text: string;
  sender: string;
  eventType: string;
}

export type { Decision };

export async function groupOrchestrator({ text, sender, chatId, eventType, messageId }: GroupOrchestratorParams) {
  try {
    const conversation = await getOrCreateConversation({ chatId, isGroup: true });

    const workflow = new StateGraph(VacationStateAnnotation)
      .addNode("orchestrator", orchestratorNode)
      .addNode("destinationAgent", destinationNode)
      .addNode("itineraryAgent", itineraryNode)
      .addNode("accommodationAgent", accommodationNode)
      .addEdge(START, "orchestrator")
      .addConditionalEdges("orchestrator", routeDecision, {
        destinationAgent: "destinationAgent",
        itineraryAgent: "itineraryAgent",
        accommodationAgent: "accommodationAgent",
        [END]: END,
      })
      .addEdge("destinationAgent", END)
      .addEdge("itineraryAgent", END)
      .addEdge("accommodationAgent", END)

    const app = workflow.compile();

    await app.invoke({
      chatId,
      messageId,
      text,
      sender,
      participantCount: conversation.participants?.length || 3,
      vacationState: conversation.vacationState || "destination",
      history: conversation.events?.slice(-15) || [],
      recent_messages: conversation.events?.slice(-4) || [],
      destination: conversation.destination || undefined,
      startDate: conversation.travelDates?.startDate || undefined,
      endDate: conversation.travelDates?.endDate || undefined,
      currentItinerary: conversation.itinerary || [],
      currentAccommodation: conversation.accommodation || null,
    });

  } catch (error) {
    console.error("❌ LangGraph Orchestration Error:", error);
    throw error;
  }
}