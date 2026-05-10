import dotenv from "dotenv";
dotenv.config();

import { StateGraph, START, END } from "@langchain/langgraph";
import { VacationStateAnnotation, type Decision } from "./state.js"; // ← import from state
import { orchestratorNode } from "./nodes/orchestrator.js";
import { destinationNode } from "./nodes/destination.js";
import { itineraryNode } from "./nodes/itinerary.js";
import { getOrCreateConversation } from "../../services/conversation.service.js";
import { accommodationNode } from "./nodes/accommodation.js";
import { routeDecision } from "./router.js";
import { createGroupNode } from "./nodes/createGroupNode.js";
import { startTyping, stopTyping } from "../../linq/client.js";

export interface GroupOrchestratorParams {
  chatId: string;
  messageId: string | undefined;
  text: string;
  sender: string;
  eventType: string;
  isGroup: boolean;
}

export type { Decision };

export async function groupOrchestrator({ text, sender, chatId, eventType, messageId, isGroup }: GroupOrchestratorParams) {
  try {
    const conversation = await getOrCreateConversation({ chatId, isGroup });

    const workflow = new StateGraph(VacationStateAnnotation)
      .addNode("orchestrator", orchestratorNode)
      .addNode("destinationAgent", destinationNode)
      .addNode("itineraryAgent", itineraryNode)
      .addNode("accommodationAgent", accommodationNode)
      .addNode("createGroupChatAgent", createGroupNode)
      .addEdge(START, "orchestrator")
      .addConditionalEdges("orchestrator", routeDecision, {
        destinationAgent: "destinationAgent",
        itineraryAgent: "itineraryAgent",
        accommodationAgent: "accommodationAgent",
        createGroupChatAgent: "createGroupChatAgent",
        [END]: END,
      })
      .addEdge("destinationAgent", END)
      .addEdge("itineraryAgent", END)
      .addEdge("accommodationAgent", END)
      .addEdge("createGroupChatAgent", END);

    const app = workflow.compile();

    await app.invoke({
      chatId,
      messageId,
      text,
      sender,
      isGroup,
      participantCount: conversation.participants?.length || 1,
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
    console.error("[Orchestration] Error:", error);
    throw error;
  }
  // finally {
  //   await stopTyping(chatId); // always stop, even on error
  // }
}