import { StateGraph, START, END } from "@langchain/langgraph";
import { VacationStateAnnotation, type Decision } from "./state.js"; // ← import from state
import { orchestratorNode } from "./nodes/orchestrator.js";
import { destinationNode } from "./nodes/destination.js";
import { itineraryNode } from "./nodes/itinerary.js";
import { executionNode } from "./nodes/execution.js";
import { routeDecision } from "./router.js";
import { getOrCreateConversation } from "../../services/conversation.service.js";

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
      .addNode("execute", executionNode)
      .addEdge(START, "orchestrator")
      .addConditionalEdges("orchestrator", routeDecision, {
        execute: "execute",
        destinationAgent: "destinationAgent",
        itineraryAgent: "itineraryAgent",
        [END]: END,
      })
      .addEdge("destinationAgent", "execute")
      .addEdge("itineraryAgent", "execute")
      .addEdge("execute", END);

    const app = workflow.compile();

    const result = await app.invoke({
      chatId,
      messageId,
      text,
      sender,
      participantCount: conversation.participants?.length || 3,
      vacationState: conversation.vacationState || "destination",
      history: conversation.events?.slice(-15) || [],
    });

    console.log("🤖 LLM Decision:", JSON.stringify(result.decision, null, 2));

    return result;
  } catch (error) {
    console.error("❌ LangGraph Orchestration Error:", error);
    throw error;
  }
}